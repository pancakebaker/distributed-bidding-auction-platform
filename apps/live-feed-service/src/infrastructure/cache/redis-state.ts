/**
 * Redis-backed idempotency and aggregate-version state for live-feed event processing.
 */
import type { RedisClientType } from 'redis';
import type { LiveFeedEnvelope } from '../../domain/events.js';
import type {
  EventAcceptanceResult,
  EventAcceptanceStatus,
  LiveStateStore,
} from '../../application/ports/live-state-store.js';

const acceptEventScript = `
local processedKey = KEYS[1]
local versionKey = KEYS[2]

local incomingVersion = tonumber(ARGV[1])
local ttlSeconds = tonumber(ARGV[2])

local currentVersion = redis.call('GET', versionKey)
local numericCurrentVersion =
  currentVersion and tonumber(currentVersion) or nil

if redis.call('EXISTS', processedKey) == 1 then
  return {'duplicate', currentVersion or ''}
end

redis.call('SET', processedKey, '1', 'EX', ttlSeconds)

if numericCurrentVersion then
  if incomingVersion < numericCurrentVersion then
    return {'stale', currentVersion}
  end

  if incomingVersion == numericCurrentVersion then
    return {'same-version', currentVersion}
  end
end

local status = 'accepted'

if numericCurrentVersion
  and incomingVersion > numericCurrentVersion + 1 then
  status = 'gap'
end

redis.call('SET', versionKey, tostring(incomingVersion))

return {status, currentVersion or ''}
`;

/**
 * Stores processed event IDs and highest auction versions in Redis using one atomic script.
 */
export class LiveFeedStateStore implements LiveStateStore {
  public constructor(
    private readonly redis: RedisClientType,
    private readonly idempotencyTtlSeconds: number,
  ) {}

  /**
   * Accepts an event only when it is new and does not regress the auction aggregate version.
   */
  public async acceptEvent(envelope: LiveFeedEnvelope): Promise<EventAcceptanceResult> {
    const result = await this.redis.eval(acceptEventScript, {
      keys: [
        this.processedEventKey(envelope.eventId),
        this.auctionVersionKey(envelope.aggregateId),
      ],
      arguments: [String(envelope.aggregateVersion), String(this.idempotencyTtlSeconds)],
    });

    return this.parseAcceptanceResult(result);
  }

  /**
   * Returns the Redis key used to deduplicate one integration event ID.
   */
  public processedEventKey(eventId: string): string {
    return `live-feed:processed-event:${eventId}`;
  }

  /**
   * Returns the Redis key that stores the highest accepted aggregate version for an auction.
   */
  public auctionVersionKey(auctionId: string): string {
    return `live-feed:auction-version:${auctionId}`;
  }

  private parseAcceptanceResult(result: unknown): EventAcceptanceResult {
    if (
      !Array.isArray(result) ||
      result.length !== 2 ||
      typeof result[0] !== 'string' ||
      typeof result[1] !== 'string'
    ) {
      throw new Error('Unexpected Redis event acceptance result.');
    }

    const status = result[0];
    const previousVersionText = result[1];

    if (!this.isAcceptanceStatus(status)) {
      throw new Error(`Unexpected Redis event acceptance status: ${status}`);
    }

    return {
      status,
      previousVersion: previousVersionText ? Number(previousVersionText) : null,
    };
  }

  private isAcceptanceStatus(value: string): value is EventAcceptanceStatus {
    return ['accepted', 'duplicate', 'stale', 'same-version', 'gap'].includes(value);
  }
}
