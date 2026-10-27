/**
 * Google echoes the API key in some error messages
 * ("Consumer 'api_key:AIza…' has been suspended"). Strip it before logging or throwing:
 * build logs on Vercel are visible to everyone on the project.
 * Also strips OAuth access tokens (`ya29.…`) and PEM private keys, in case one ever ends up
 * in a message on the service-account path.
 */
export function redactKey(msg: string, key?: string): string {
  let out = msg.replace(/AIza[0-9A-Za-z_-]{20,}/g, 'AIza…');
  if (key) out = out.split(key).join('AIza…');
  out = out.replace(/ya29\.[0-9A-Za-z._-]+/g, 'ya29.…');
  out = out.replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g, '[chave privada]');
  return out;
}
