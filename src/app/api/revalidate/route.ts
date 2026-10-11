import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { LANGS, langPath } from '@/content/langs';
import { clientIp, createLimiter, secretConfigured, secretMatches } from './guard';

/**
 * POST /api/revalidate — called by the sheet's "Site → Publicar alterações" menu (apps-script/Code.gs)
 * with the header `x-revalidate-secret: <REVALIDATE_SECRET>`. Regenerates every language's home page
 * and /status so the sheet's changes show up on the next visit instead of within 5 minutes.
 *
 * 200 ok · 401 wrong/missing secret · 429 too many requests (Retry-After) · 503 secret not configured.
 */

// Wrong secrets: 5 per IP per 15 min, then 429 until the window ends (brute-force speed bump).
const failures = createLimiter({ limit: 5, windowMs: 15 * 60_000 });
// Any request: 10 per IP per minute (someone clicking "Publicar" in a loop).
const requests = createLimiter({ limit: 10, windowMs: 60_000 });

const NO_STORE = { 'Cache-Control': 'no-store' };
const json = (body: object, status: number, headers: Record<string, string> = {}) =>
  NextResponse.json(body, { status, headers: { ...NO_STORE, ...headers } });

export async function POST(req: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secretConfigured(secret)) {
    console.error('[revalidate] REVALIDATE_SECRET missing, too short or still the placeholder');
    return json({ ok: false, error: 'not_configured' }, 503);
  }

  const ip = clientIp(req.headers);
  const wait = Math.max(failures.retryAfter(ip), requests.retryAfter(ip));
  if (wait > 0) return json({ ok: false, error: 'too_many_requests' }, 429, { 'Retry-After': String(wait) });
  requests.hit(ip);

  if (!secretMatches(req.headers.get('x-revalidate-secret'), secret)) {
    failures.hit(ip);
    console.warn(`[revalidate] wrong secret from ${ip}`);
    return json({ ok: false, error: 'unauthorized' }, 401);
  }

  const paths = [...LANGS.map(langPath), '/status'];
  for (const p of paths) revalidatePath(p);
  return json({ ok: true, revalidated: paths, at: new Date().toISOString() }, 200);
}
