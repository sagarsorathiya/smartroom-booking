import { Request } from 'express';

/**
 * Extract the client IPv4 address from a request.
 * Handles x-forwarded-for headers and IPv6-mapped IPv4 addresses.
 */
export function getClientIp(req: Request): string {
  // Check headers set by reverse proxies (in priority order)
  const forwarded = req.headers['x-forwarded-for'];
  const realIp = req.headers['x-real-ip'];

  let ip = typeof forwarded === 'string'
    ? forwarded.split(',')[0].trim()
    : typeof realIp === 'string'
      ? realIp.trim()
      : req.ip || req.socket.remoteAddress || '';

  // Convert IPv6-mapped IPv4 (::ffff:127.0.0.1 → 127.0.0.1)
  if (ip.startsWith('::ffff:')) {
    ip = ip.slice(7);
  }

  // If it's still a pure IPv6 loopback (::1), map to 127.0.0.1
  if (ip === '::1') {
    ip = '127.0.0.1';
  }

  return ip;
}
