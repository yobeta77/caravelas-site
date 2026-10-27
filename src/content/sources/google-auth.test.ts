import { createVerify, generateKeyPairSync } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearTokenCache,
  getAccessToken,
  normalizePrivateKey,
  sheetsAuthFromEnv,
  signAssertion,
  SHEETS_READONLY,
} from './google-auth';

// A throwaway key generated per run: no real credential lives in the repo.
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const sa = { email: 'site-reader@caravelas-site.iam.gserviceaccount.com', privateKey };
const T0 = Date.UTC(2026, 9, 27, 12, 0, 0);

const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString());

function fakeGoogle(responses: { status: number; body: unknown }[]) {
  const calls: { url: string; body: URLSearchParams }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: new URLSearchParams(String(init.body)) });
    const r = responses[Math.min(calls.length - 1, responses.length - 1)]!;
    return new Response(JSON.stringify(r.body), { status: r.status });
  }) as unknown as typeof fetch;
  return { f, calls };
}

beforeEach(() => clearTokenCache());

describe('normalizePrivateKey', () => {
  it('accepts the key as it appears in the JSON file (literal \\n), with quotes, or with real newlines', () => {
    const oneLine = privateKey.trim().replace(/\n/g, '\\n');
    expect(normalizePrivateKey(oneLine)).toBe(privateKey);
    expect(normalizePrivateKey(`"${oneLine}"`)).toBe(privateKey);
    expect(normalizePrivateKey(privateKey.replace(/\n/g, '\r\n'))).toBe(privateKey);
    expect(normalizePrivateKey(`  ${privateKey}  `)).toBe(privateKey);
  });
  it('rejects something that is not a PKCS#8 key, without echoing it', () => {
    expect(() => normalizePrivateKey('AIzaSy-not-a-key')).toThrow(/chave da conta de serviço não é válida/);
    expect(() => normalizePrivateKey('AIzaSy-not-a-key')).not.toThrow(/AIza/);
  });
});

describe('signAssertion', () => {
  it('builds an RS256 JWT for the token endpoint, valid for one hour, verifiable with the public key', () => {
    const jwt = signAssertion(sa, SHEETS_READONLY, T0);
    const [h, c, s] = jwt.split('.');
    expect(decode(h!)).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(decode(c!)).toEqual({
      iss: sa.email,
      scope: SHEETS_READONLY,
      aud: 'https://oauth2.googleapis.com/token',
      iat: T0 / 1000,
      exp: T0 / 1000 + 3600,
    });
    const ok = createVerify('RSA-SHA256').update(`${h}.${c}`).verify(publicKey, Buffer.from(s!, 'base64url'));
    expect(ok).toBe(true);
  });
  it('a corrupt key gives our message, never the crypto one', () => {
    const broken = privateKey.replace(/\n[A-Za-z0-9+/]{20}/, '\nAAAA');
    expect(() => signAssertion({ ...sa, privateKey: broken }, SHEETS_READONLY, T0)).toThrow(/^Sheets: /);
  });
});

describe('getAccessToken', () => {
  it('trades the assertion for a token and caches it until 5 minutes before expiry', async () => {
    const { f, calls } = fakeGoogle([
      { status: 200, body: { access_token: 'ya29.first', expires_in: 3599 } },
      { status: 200, body: { access_token: 'ya29.second', expires_in: 3599 } },
    ]);
    let now = T0;
    const deps = { fetch: f, now: () => now };

    expect(await getAccessToken(sa, SHEETS_READONLY, deps)).toBe('ya29.first');
    expect(calls[0]!.url).toBe('https://oauth2.googleapis.com/token');
    expect(calls[0]!.body.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    expect(calls[0]!.body.get('assertion')?.split('.')).toHaveLength(3);

    now = T0 + 50 * 60_000; // 50 min: still cached
    expect(await getAccessToken(sa, SHEETS_READONLY, deps)).toBe('ya29.first');
    expect(calls).toHaveLength(1);

    now = T0 + 56 * 60_000; // inside the 5-minute margin: refresh
    expect(await getAccessToken(sa, SHEETS_READONLY, deps)).toBe('ya29.second');
    expect(calls).toHaveLength(2);
  });

  it("explains Google's refusal without leaking the assertion", async () => {
    const { f } = fakeGoogle([{ status: 400, body: { error: 'invalid_grant', error_description: 'Invalid JWT Signature.' } }]);
    const err = await getAccessToken(sa, SHEETS_READONLY, { fetch: f, now: () => T0 }).catch((e: Error) => e);
    expect((err as Error).message).toBe('Sheets: a Google recusou a conta de serviço (HTTP 400 — invalid_grant: Invalid JWT Signature.)');
    expect((err as Error).message).not.toMatch(/eyJ/); // base64url of '{"' = start of a JWT
  });

  it('reports a network failure by name', async () => {
    const f = (async () => {
      throw Object.assign(new Error('x'), { name: 'TimeoutError' });
    }) as unknown as typeof fetch;
    await expect(getAccessToken(sa, SHEETS_READONLY, { fetch: f, now: () => T0 })).rejects.toThrow(
      'Sheets: sem resposta da Google ao pedir o token (TimeoutError)',
    );
  });
});

describe('sheetsAuthFromEnv', () => {
  it('prefers the service account when both are set', () => {
    expect(sheetsAuthFromEnv({ SHEETS_SA_EMAIL: sa.email, SHEETS_SA_PRIVATE_KEY: 'k', SHEETS_API_KEY: 'AIza' })).toEqual({
      kind: 'service-account',
      account: { email: sa.email, privateKey: 'k' },
    });
  });
  it('falls back to the API key only when no service-account var is set', () => {
    expect(sheetsAuthFromEnv({ SHEETS_API_KEY: ' AIzaKey ' })).toEqual({ kind: 'api-key', key: 'AIzaKey' });
  });
  it('half a service account is an error, not a silent fallback', () => {
    expect(() => sheetsAuthFromEnv({ SHEETS_SA_EMAIL: sa.email, SHEETS_API_KEY: 'AIza' })).toThrow(/precisa das duas/);
    expect(() => sheetsAuthFromEnv({ SHEETS_SA_PRIVATE_KEY: 'k' })).toThrow(/precisa das duas/);
  });
  it('no credentials at all', () => {
    expect(() => sheetsAuthFromEnv({})).toThrow(/precisa de SHEETS_SA_EMAIL/);
  });
});
