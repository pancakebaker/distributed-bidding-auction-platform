/**
 * Redis-backed idempotency and aggregate-version state for live-feed event processing.
 */
import type { RedisClientType } from 'redis';
import type { LiveFeedEnvelope } from '../../domain/events.js';
import type {
  EventAcceptanceResult,
  EventAcceptanceStatus,
  LiveAuctionProjection,
  LiveStateStore,
} from '../../application/ports/live-state-store.js';
import { integrationEventTypes } from '../../domain/events.js';

const acceptEventScript = `
local processedKey = KEYS[1]
local versionKey = KEYS[2]
local projectionKey = KEYS[3]

local incomingVersion = tonumber(ARGV[1])
local ttlSeconds = tonumber(ARGV[2])
local eventType = ARGV[3]
local currentBidderId = ARGV[4]
local currentBidAmount = ARGV[5]
local finalWinnerId = ARGV[6]
local finalPrice = ARGV[7]
local occurredAtUtc = ARGV[8]

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
    redis.call('HSET', projectionKey, 'aggregateVersion', tostring(incomingVersion))
    if eventType == 'BidAccepted' then
      redis.call('HSET', projectionKey, 'currentBidderId', currentBidderId, 'currentBidAmount', currentBidAmount)
    elseif eventType == 'AuctionClosed' then
      redis.call('HSET', projectionKey, 'status', 'Closed')
      if finalPrice ~= '' then
        redis.call('HSET', projectionKey, 'finalWinnerId', finalWinnerId, 'finalPrice', finalPrice)
      else
        redis.call('HDEL', projectionKey, 'finalWinnerId', 'finalPrice')
      end
    elseif eventType == 'WinnerSelected' then
      redis.call('HSET', projectionKey, 'status', 'Closed', 'finalWinnerId', finalWinnerId, 'finalPrice', finalPrice)
    elseif eventType == 'AuctionPurchased' then
      redis.call('HSET', projectionKey, 'status', 'Closed', 'finalWinnerId', finalWinnerId, 'finalPrice', finalPrice, 'purchasedAtUtc', occurredAtUtc)
    end
    return {'same-version', currentVersion}
  end
end

local status = 'accepted'

if numericCurrentVersion
  and incomingVersion > numericCurrentVersion + 1 then
  status = 'gap'
end

redis.call('SET', versionKey, tostring(incomingVersion))

redis.call('HSET', projectionKey, 'aggregateVersion', tostring(incomingVersion))
if eventType == 'BidAccepted' then
  redis.call('HSET', projectionKey, 'currentBidderId', currentBidderId, 'currentBidAmount', currentBidAmount)
elseif eventType == 'AuctionClosed' then
  redis.call('HSET', projectionKey, 'status', 'Closed')
  if finalPrice ~= '' then
    redis.call('HSET', projectionKey, 'finalWinnerId', finalWinnerId, 'finalPrice', finalPrice)
  else
    redis.call('HDEL', projectionKey, 'finalWinnerId', 'finalPrice')
  end
elseif eventType == 'WinnerSelected' then
  redis.call('HSET', projectionKey, 'status', 'Closed', 'finalWinnerId', finalWinnerId, 'finalPrice', finalPrice)
elseif eventType == 'AuctionPurchased' then
  redis.call('HSET', projectionKey, 'status', 'Closed', 'finalWinnerId', finalWinnerId, 'finalPrice', finalPrice, 'purchasedAtUtc', occurredAtUtc)
end

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
        this.projectionKey(envelope.aggregateId),
      ],
      arguments: [
        String(envelope.aggregateVersion),
        String(this.idempotencyTtlSeconds),
        envelope.eventType,
        ...this.projectionArguments(envelope),
      ],
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

  /** Returns the Redis hash key used for the non-authoritative auction projection. */
  public projectionKey(auctionId: string): string {
    return `live-feed:auction:${auctionId}`;
  }

  /** Reads the latest projected auction state, if one has been accepted. */
  public async getProjection(auctionId: string): Promise<LiveAuctionProjection | null> {
    const values = await this.redis.hGetAll(this.projectionKey(auctionId));
    if (Object.keys(values).length === 0) {
      return null;
    }

    return {
      auctionId,
      aggregateVersion: Number(values.aggregateVersion),
      status: values.status === 'Closed' ? 'Closed' : undefined,
      currentBidAmount: values.currentBidAmount ? Number(values.currentBidAmount) : undefined,
      currentBidderId: values.currentBidderId || undefined,
      finalWinnerId: values.finalWinnerId || undefined,
      finalPrice: values.finalPrice ? Number(values.finalPrice) : undefined,
      purchasedAtUtc: values.purchasedAtUtc || undefined,
    };
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

  private projectionArguments(envelope: LiveFeedEnvelope): string[] {
    if (envelope.eventType === integrationEventTypes.bidAccepted) {
      return [envelope.payload.bidderId, String(envelope.payload.amount), '', '', ''];
    }

    if (envelope.eventType === integrationEventTypes.auctionClosed) {
      return [
        '',
        '',
        envelope.payload.finalBidderId ?? '',
        envelope.payload.finalBidAmount === null ? '' : String(envelope.payload.finalBidAmount),
        '',
      ];
    }

    if (envelope.eventType === integrationEventTypes.winnerSelected) {
      return ['', '', envelope.payload.winnerId, String(envelope.payload.amount), ''];
    }

    return [
      '',
      '',
      envelope.payload.bidderId,
      String(envelope.payload.finalPrice),
      envelope.payload.purchasedAtUtc,
    ];
  }

  private isAcceptanceStatus(value: string): value is EventAcceptanceStatus {
    return ['accepted', 'duplicate', 'stale', 'same-version', 'gap'].includes(value);
  }
}
