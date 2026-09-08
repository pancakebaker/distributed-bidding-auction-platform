/**
 * Small signed-cookie admin authorization boundary for the operational live-feed page.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Configuration for the fixed demo/admin credential boundary.
 */
export type AdminAuthOptions = {
  username?: string;
  password?: string;
  secret?: string;
  secure?: boolean;
  now?: () => number;
  sessionLifetimeSeconds?: number;
};

/**
 * Signed HttpOnly cookie authorization for the read-only operations page.
 */
export class AdminAuth {
  private readonly username: string | undefined;
  private readonly password: string | undefined;
  private readonly secret: string;
  private readonly secure: boolean;
  private readonly now: () => number;
  private readonly sessionLifetimeSeconds: number;

  public constructor(options: AdminAuthOptions = {}) {
    this.username = options.username ?? process.env.LIVE_FEED_ADMIN_USERNAME;
    this.password = options.password ?? process.env.LIVE_FEED_ADMIN_PASSWORD;
    this.secret = options.secret ?? process.env.LIVE_FEED_ADMIN_SESSION_SECRET ?? randomBytes(32).toString('hex');
    this.secure = options.secure ?? process.env.NODE_ENV === 'production';
    this.now = options.now ?? (() => Date.now());
    this.sessionLifetimeSeconds = options.sessionLifetimeSeconds ?? 900;
  }

  /**
   * Creates a signed admin cookie when configured credentials match.
   */
  public authenticate(username: string, password: string): string | null {
    if (!this.username || !this.password || username !== this.username || password !== this.password) {
      return null;
    }

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
    if (!token) {
      return false;
    }

    const [expiresText, nonce, signature] = token.split('.');
    const expiresAt = Number(expiresText);
    if (!Number.isInteger(expiresAt) || !nonce || !signature || expiresAt < Math.floor(this.now() / 1000)) {
      return false;
    }

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
