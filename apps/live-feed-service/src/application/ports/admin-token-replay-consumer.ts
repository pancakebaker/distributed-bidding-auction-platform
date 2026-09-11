/**
 * Application-facing boundary for consuming validated live-feed admin token JTIs once.
 */

/** Result of attempting to consume one validated admin token identifier. */
export type AdminTokenReplayConsumeResult =
  { outcome: 'consumed' } | { outcome: 'already_consumed' };

/**
 * Consumes a validated admin token identifier until the token expires.
 *
 * Implementations must reject the promise when their backing storage is unavailable. Storage
 * failure must not be reported as an already-consumed token.
 */
export interface AdminTokenReplayConsumer {
  consume(jti: string, expiresAt: Date): Promise<AdminTokenReplayConsumeResult>;
}
