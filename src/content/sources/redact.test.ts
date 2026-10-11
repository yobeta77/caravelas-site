import { describe, expect, it } from 'vitest';
import { redactKey } from './redact';

describe('redactKey', () => {
  const key = 'AIzaSyFAKEfakeFAKEfakeFAKEfakeFAKEfake12';
  it("removes the key from Google's error messages", () => {
    const msg = `Sheets: HTTP 403 — Permission denied: Consumer 'api_key:${key}' has been suspended.`;
    expect(redactKey(msg, key)).toBe("Sheets: HTTP 403 — Permission denied: Consumer 'api_key:AIza…' has been suspended.");
  });
  it('removes any AIza-looking key even without knowing it', () => {
    expect(redactKey(`bad key ${key}`)).toBe('bad key AIza…');
  });
  it('leaves other messages alone', () => {
    expect(redactKey('Unable to parse range: precos', key)).toBe('Unable to parse range: precos');
  });
});
