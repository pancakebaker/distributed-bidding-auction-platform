/** Redis-backed first-use tracking for validated live-feed admin token JTIs. */
import { createHash } from 'node:crypto';
import type { RedisClientType } from 'redis';
import type {
  AdminTokenReplayConsumeResult,
  AdminTokenReplayConsumer,
} from '../../application/ports/admin-token-replay-consumer.js';

type ReplayRedisClient = Pick<RedisClientType, 'set'>;

/** Options for the Redis-backed admin token replay consumer. */
export type RedisAdminTokenReplayConsumerOptions = {
  now?: () => number;
};

/**
 * Consumes validated admin token JTIs once using an atomic Redis write that expires with the JWT.
 */
export class RedisAdminTokenReplayConsumer implements AdminTokenReplayConsumer {
  private readonly now: () => number;

  public constructor(
    private readonly redis: ReplayRedisClient,
    options: RedisAdminTokenReplayConsumerOptions = {},
  ) {
    this.now = options.now ?? (() => Date.now());
  }

  /**
   * Atomically records a JTI until its token expires.
   *
   * Redis errors reject to keep storage failure distinct from a replay result.
   */
  public async consume(jti: string, expiresAt: Date): Promise<AdminTokenReplayConsumeResult> {
    const ttlMilliseconds = expiresAt.getTime() - this.now();
    if (!Number.isFinite(expiresAt.getTime()) || ttlMilliseconds <= 0) {
      throw new Error('Admin token replay expiry must be in the future.');
    }

    const result = await this.redis.set(this.replayKey(jti), '1', {
      NX: true,
      PX: ttlMilliseconds,
    });

    return result === 'OK' ? { outcome: 'consumed' } : { outcome: 'already_consumed' };
  }

  /** Returns the service-local Redis key for a JTI without exposing the raw identifier. */
  public replayKey(jti: string): string {
    const digest = createHash('sha256').update(jti, 'utf8').digest('hex');
    return `live-feed:auth:consumed-jti:${digest}`;
  }
}
