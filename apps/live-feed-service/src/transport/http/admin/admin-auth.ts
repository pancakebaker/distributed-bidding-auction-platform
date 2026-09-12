/**
 * Small signed-cookie session boundary for the system-admin-authorized live-feed operations page.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { AdminHandoffClaims } from '../../../application/ports/admin-handoff-store.js';

/**
 * Configuration for the short-lived local Node admin session.
 */
export type AdminAuthOptions = {
  secret?: string;
  secure?: boolean;
  now?: () => number;
  sessionLifetimeSeconds?: number;
};

/**
 * Signs and validates the short-lived HttpOnly cookie established after Laravel token exchange.
 */
export class AdminAuth {
  private readonly secret: string;
  private readonly secure: boolean;
  private readonly now: () => number;
  private readonly sessionLifetimeSeconds: number;

  public constructor(options: AdminAuthOptions = {}) {
    const configuredSecret = options.secret ?? process.env.LIVE_FEED_ADMIN_SESSION_SECRET;
    if (
      process.env.NODE_ENV === 'production' &&
      (!configuredSecret || configuredSecret.length < 32)
    ) {
      throw new Error(
        'LIVE_FEED_ADMIN_SESSION_SECRET must be configured with at least 32 characters in production.',
      );
    }
    this.secret = configuredSecret ?? randomBytes(32).toString('hex');
    this.secure = options.secure ?? process.env.NODE_ENV === 'production';
    this.now = options.now ?? (() => Date.now());
    this.sessionLifetimeSeconds = options.sessionLifetimeSeconds ?? 900;
  }

  /**
   * Creates a signed local session after an upstream Laravel admin token is verified.
   */
  public createSession(claims?: AdminHandoffClaims): string {
    const expiresAt = Math.floor(this.now() / 1000) + this.sessionLifetimeSeconds;
    const session = claims
      ? Buffer.from(JSON.stringify({ ...claims, exp: expiresAt })).toString('base64url')
      : String(expiresAt);
    const payload = session + '.' + randomBytes(12).toString('hex');
    const signature = this.sign(payload);
    const secure = this.secure ? '; Secure' : '';

    return (
      'live_feed_admin=' +
      payload +
      '.' +
      signature +
      '; HttpOnly; SameSite=Lax; Path=/; Max-Age=' +
      this.sessionLifetimeSeconds +
      secure
    );
  }

  /**
   * Checks whether a cookie header contains a valid, unexpired signed admin session.
   */
  public isAuthorizedCookie(cookieHeader: string | undefined): boolean {
    const token = readCookie(cookieHeader, 'live_feed_admin');
    if (!token) return false;

    const [sessionText, nonce, signature] = token.split('.');
    const expiresAt = Number(sessionText) || readSessionExpiry(sessionText);
    if (
      !Number.isInteger(expiresAt) ||
      !nonce ||
      !signature ||
      expiresAt <= Math.floor(this.now() / 1000)
    )
      return false;

    const expected = this.sign(sessionText + '.' + nonce);
    const providedBytes = Buffer.from(signature);
    const expectedBytes = Buffer.from(expected);
    return (
      providedBytes.length === expectedBytes.length && timingSafeEqual(providedBytes, expectedBytes)
    );
  }

  /**
   * Returns a deletion cookie for logout.
   */
  public clearCookie(): string {
    const secure = this.secure ? '; Secure' : '';
    return 'live_feed_admin=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' + secure;
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.secret).update(payload).digest('base64url');
  }
}

function readSessionExpiry(sessionText: string): number {
  try {
    const value: unknown = JSON.parse(Buffer.from(sessionText, 'base64url').toString('utf8'));
    return value &&
      typeof value === 'object' &&
      typeof (value as { exp?: unknown }).exp === 'number'
      ? (value as { exp: number }).exp
      : Number.NaN;
  } catch {
    return Number.NaN;
  }
}

function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  return cookieHeader
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(name + '='))
    ?.slice(name.length + 1);
}
