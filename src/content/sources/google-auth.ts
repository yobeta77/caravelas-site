import { createSign } from 'node:crypto';

/**
 * Google service-account auth without a Google SDK (Juanpi).
 * Signs a JWT (RS256) with the service account's private key and trades it for a
 * short-lived OAuth access token: https://developers.google.com/identity/protocols/oauth2/service-account#httprest
 *
 * The token is cached in memory per (email, scope) until 5 minutes before it expires,
 * so a warm serverless instance asks Google once an hour, not on every revalidation.
 * Errors never contain the private key, the signed assertion or the token.
 */
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const TOKEN_TTL_S = 3600; // the maximum Google accepts
const REFRESH_MARGIN_MS = 5 * 60_000;
const TIMEOUT_MS = 10_000;

/** Read-only access to the sheets shared with the service account. A future panel that writes needs `.../auth/spreadsheets`. */
export const SHEETS_READONLY = 'https://www.googleapis.com/auth/spreadsheets.readonly';

export interface ServiceAccount {
  email: string;
  privateKey: string;
}

export type SheetsAuth = { kind: 'service-account'; account: ServiceAccount } | { kind: 'api-key'; key: string };

/** Which credentials the env provides. Half a service account is an error, not a silent fallback to the key. */
export function sheetsAuthFromEnv(env: Record<string, string | undefined> = process.env): SheetsAuth {
  const email = env.SHEETS_SA_EMAIL?.trim();
  const privateKey = env.SHEETS_SA_PRIVATE_KEY;
  if (email || privateKey) {
    if (!email || !privateKey?.trim()) {
      throw new Error('CONTENT_SOURCE=sheets: falta SHEETS_SA_EMAIL ou SHEETS_SA_PRIVATE_KEY (a conta de serviço precisa das duas)');
    }
    return { kind: 'service-account', account: { email, privateKey } };
  }
  const key = env.SHEETS_API_KEY?.trim();
  if (key) return { kind: 'api-key', key };
  throw new Error('CONTENT_SOURCE=sheets precisa de SHEETS_SA_EMAIL + SHEETS_SA_PRIVATE_KEY (ou, provisoriamente, SHEETS_API_KEY)');
}

interface Deps {
  fetch?: typeof fetch;
  now?: () => number;
}

const cache = new Map<string, { token: string; expiresAt: number }>();

/** Test helper. */
export function clearTokenCache(): void {
  cache.clear();
}

/**
 * Accept the key as pasted from the JSON key file's `private_key` field: with real newlines,
 * with literal `\n` (how it looks inside the JSON / a one-line env var), or wrapped in quotes.
 */
export function normalizePrivateKey(raw: string): string {
  let k = raw.trim();
  if ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'"))) k = k.slice(1, -1);
  k = k.replace(/\\r/g, '').replace(/\\n/g, '\n').replace(/\r\n/g, '\n').trim();
  if (!/^-----BEGIN PRIVATE KEY-----\n[\s\S]+\n-----END PRIVATE KEY-----$/.test(k)) {
    throw new Error(
      'Sheets: a chave da conta de serviço não é válida (esperado o campo "private_key" do ficheiro JSON, de -----BEGIN PRIVATE KEY----- a -----END PRIVATE KEY-----)',
    );
  }
  return k + '\n';
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString('base64url');

/** The signed JWT ("assertion") sent to Google's token endpoint. Exported for tests. */
export function signAssertion(sa: ServiceAccount, scope: string, nowMs: number): string {
  const iat = Math.floor(nowMs / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: sa.email, scope, aud: TOKEN_URL, iat, exp: iat + TOKEN_TTL_S }));
  const input = `${header}.${claims}`;
  let sig: Buffer;
  try {
    sig = createSign('RSA-SHA256').update(input).sign(normalizePrivateKey(sa.privateKey));
  } catch (e) {
    // the crypto error can quote part of the key: keep only our own message
    if ((e as Error).message.startsWith('Sheets:')) throw e;
    throw new Error('Sheets: não foi possível assinar com a chave da conta de serviço (chave corrompida ou incompleta)');
  }
  return `${input}.${b64url(sig)}`;
}

export async function getAccessToken(sa: ServiceAccount, scope: string, deps: Deps = {}): Promise<string> {
  const doFetch = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;
  const cacheKey = `${sa.email} ${scope}`;
  const hit = cache.get(cacheKey);
  if (hit && hit.expiresAt - REFRESH_MARGIN_MS > now()) return hit.token;

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: signAssertion(sa, scope, now()),
  });

  let res: Response;
  try {
    // POST without `cache`/`next` options: never stored in Next's data cache and doesn't make the page dynamic.
    res = await doFetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw new Error(`Sheets: sem resposta da Google ao pedir o token (${(e as Error).name})`);
  }

  const data = (await res.json().catch(() => null)) as
    | { access_token?: string; expires_in?: number; error?: string; error_description?: string }
    | null;
  if (!res.ok || !data?.access_token) {
    // e.g. `invalid_grant: Invalid JWT Signature.` (wrong/revoked key) or `invalid_grant: Invalid JWT: Token must be a short-lived token` (clock)
    const why = [data?.error, data?.error_description].filter(Boolean).join(': ') || res.statusText || 'sem token';
    throw new Error(`Sheets: a Google recusou a conta de serviço (HTTP ${res.status} — ${why})`);
  }

  const ttlMs = (data.expires_in ?? TOKEN_TTL_S) * 1000;
  cache.set(cacheKey, { token: data.access_token, expiresAt: now() + ttlMs });
  return data.access_token;
}
