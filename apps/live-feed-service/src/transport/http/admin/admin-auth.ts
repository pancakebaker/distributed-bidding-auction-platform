/**
 * Small signed-cookie session boundary for the Laravel-authorized live-feed operations page.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

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
    this.secret = options.secret ?? process.env.LIVE_FEED_ADMIN_SESSION_SECRET ?? randomBytes(32).toString('hex');
    this.secure = options.secure ?? process.env.NODE_ENV === 'production';
    this.now = options.now ?? (() => Date.now());
    this.sessionLifetimeSeconds = options.sessionLifetimeSeconds ?? 900;
  }

  /**
   * Creates a signed local session after an upstream Laravel admin token is verified.
   */
  public createSession(): string {
    const expiresAt = Math.floor(this.now() / 1000) + this.sessionLifetimeSeconds;
    const payload = String(expiresAt) + '.' + randomBytes(12).toString('hex');
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

    const [expiresText, nonce, signature] = token.split('.');
    const expiresAt = Number(expiresText);
    if (!Number.isInteger(expiresAt) || !nonce || !signature || expiresAt < Math.floor(this.now() / 1000)) return false;

    const expected = this.sign(expiresText + '.' + nonce);
    const providedBytes = Buffer.from(signature);
    const expectedBytes = Buffer.from(expected);
    return providedBytes.length === expectedBytes.length && timingSafeEqual(providedBytes, expectedBytes);
  }

  /**
   * Returns a deletion cookie for logout.
   */
  public clearCookie(): string {
    return 'live_feed_admin=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0';
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.secret).update(payload).digest('base64url');
  }
}

function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  return cookieHeader
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(name + '='))
    ?.slice(name.length + 1);
}
