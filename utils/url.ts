export function isValidUrl(str: string): boolean {
  try { const u = new URL(str); return u.protocol === 'https:' || u.protocol === 'http:'; } catch { return false; }
}
