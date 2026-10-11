import { describe, expect, it } from 'vitest';
import { clientIp, createLimiter, secretConfigured, secretMatches } from './guard';

describe('secretConfigured', () => {
  it('rejects missing, short and placeholder secrets', () => {
    expect(secretConfigured(undefined)).toBe(false);
    expect(secretConfigured('')).toBe(false);
    expect(secretConfigured('short')).toBe(false);
    expect(secretConfigured('change-me')).toBe(false);
  });
  it('accepts a long random secret', () => {
    expect(secretConfigured('k3J9xQ2mP8vR4tW7zL1n')).toBe(true);
  });
});

describe('secretMatches', () => {
  const s = 'k3J9xQ2mP8vR4tW7zL1n';
  it('matches only the exact secret', () => {
    expect(secretMatches(s, s)).toBe(true);
    expect(secretMatches(`${s} `, s)).toBe(false);
    expect(secretMatches(s.slice(0, -1), s)).toBe(false);
    expect(secretMatches('', s)).toBe(false);
    expect(secretMatches(null, s)).toBe(false);
  });
  it('does not throw on different lengths', () => {
    expect(secretMatches('x'.repeat(500), s)).toBe(false);
  });
});

describe('clientIp', () => {
  it('takes the first x-forwarded-for hop, then x-real-ip', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }))).toBe('203.0.113.7');
    expect(clientIp(new Headers({ 'x-real-ip': '198.51.100.2' }))).toBe('198.51.100.2');
    expect(clientIp(new Headers())).toBe('unknown');
  });
});

describe('createLimiter', () => {
  const clock = (start = 0) => {
    let t = start;
    return { now: () => t, advance: (ms: number) => { t += ms; } };
  };

  it('allows up to the limit, then asks to wait until the window ends', () => {
    const c = clock();
    const l = createLimiter({ limit: 3, windowMs: 60_000, now: c.now });
    for (let i = 0; i < 3; i++) {
      expect(l.retryAfter('a')).toBe(0);
      l.hit('a');
    }
    expect(l.retryAfter('a')).toBe(60);
    c.advance(45_000);
    expect(l.retryAfter('a')).toBe(15);
    c.advance(15_000);
    expect(l.retryAfter('a')).toBe(0); // new window
  });

  it('keeps keys apart', () => {
    const l = createLimiter({ limit: 1, windowMs: 1000, now: () => 0 });
    l.hit('a');
    expect(l.retryAfter('a')).toBe(1);
    expect(l.retryAfter('b')).toBe(0);
  });

  it('never holds more than maxKeys keys', () => {
    const c = clock();
    const l = createLimiter({ limit: 1, windowMs: 1000, maxKeys: 10, now: c.now });
    for (let i = 0; i < 50; i++) l.hit(`ip${i}`);
    expect(l.size()).toBeLessThanOrEqual(10);
    c.advance(2000);
    l.hit('late');
    expect(l.size()).toBe(1); // expired buckets pruned
  });
});
