/**
 * Persists short-lived, single-use browser handoff codes in Redis for Live Feed admin sessions.
 */
import { createHash, randomBytes } from 'node:crypto';
import type { RedisClientType } from 'redis';
import type {
  AdminHandoffClaims,
  AdminHandoffStore,
} from '../../application/ports/admin-handoff-store.js';

type HandoffRedisClient = Pick<RedisClientType, 'set' | 'getDel'>;

/** Redis-backed, expiring, one-time browser handoff storage. */
export class RedisAdminHandoffStore implements AdminHandoffStore {
  public constructor(
    private readonly redis: HandoffRedisClient,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Creates an expiring one-time handoff code containing only validated session claims. */
  public async create(claims: AdminHandoffClaims, expiresAt: Date): Promise<string> {
    const ttlSeconds = Math.ceil((expiresAt.getTime() - this.now()) / 1000);
    if (!Number.isFinite(expiresAt.getTime()) || ttlSeconds <= 0) {
      throw new Error('Admin handoff expiry must be in the future.');
    }

    const code = randomBytes(32).toString('base64url');
    const result = await this.redis.set(this.key(code), JSON.stringify(claims), {
      NX: true,
      EX: ttlSeconds,
    });
    if (result !== 'OK') throw new Error('Admin handoff code could not be created.');
    return code;
  }

  /** Atomically retrieves and removes a handoff code so it cannot be reused. */
  public async consume(code: string): Promise<AdminHandoffClaims | undefined> {
    if (!/^[A-Za-z0-9_-]{40,64}$/.test(code)) return undefined;
    const value = await this.redis.getDel(this.key(code));
    if (!value) return undefined;

    try {
      const parsed: unknown = JSON.parse(value);
      if (!parsed || typeof parsed !== 'object') return undefined;
      const record = parsed as Partial<AdminHandoffClaims>;
      return typeof record.sub === 'string' &&
        typeof record.role === 'string' &&
        Array.isArray(record.permissions) &&
        record.permissions.every((permission) => typeof permission === 'string')
        ? {
            sub: record.sub,
            role: record.role,
            permissions: record.permissions,
          }
        : undefined;
    } catch {
      return undefined;
    }
  }

  private key(code: string): string {
    const digest = createHash('sha256').update(code, 'utf8').digest('hex');
    return `live-feed:auth:handoff:${digest}`;
  }
}
