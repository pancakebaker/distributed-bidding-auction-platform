/**
 * Security headers for the browser-facing live-feed operations surface.
 */
import type { Response } from 'express';

/**
 * Applies a small CSP and defensive headers to admin responses.
 */
export function applyAdminSecurityHeaders(response: Response): void {
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' ws: wss:; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  );
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Frame-Options', 'DENY');
}
