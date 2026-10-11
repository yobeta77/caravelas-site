/**
 * Google echoes the API key in some error messages
 * ("Consumer 'api_key:AIza…' has been suspended"). Strip it before logging or throwing:
 * build logs on Vercel are visible to everyone on the project.
 */
export function redactKey(msg: string, key?: string): string {
  let out = msg.replace(/AIza[0-9A-Za-z_-]{20,}/g, 'AIza…');
  if (key) out = out.split(key).join('AIza…');
  return out;
}
