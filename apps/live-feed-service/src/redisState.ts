import type { RedisClientType } from "redis";
import type { BidAcceptedEnvelope } from "./events.js";

export type EventAcceptanceResult = {
  status: "accepted" | "duplicate" | "stale" | "gap";
  previousVersion: number | null;
};

const acceptEventScript = `
local processedKey = KEYS[1]
local versionKey = KEYS[2]
local incomingVersion = tonumber(ARGV[1])
local ttlSeconds = tonumber(ARGV[2])

if redis.call('EXISTS', processedKey) == 1 then
  local currentVersion = redis.call('GET', versionKey)
  return {'duplicate', currentVersion or ''}
end

redis.call('SET', processedKey, '1', 'EX', ttlSeconds)

local currentVersion = redis.call('GET', versionKey)
if currentVersion and tonumber(currentVersion) >= incomingVersion then
  return {'stale', currentVersion}
end

local status = 'accepted'
if currentVersion and incomingVersion > tonumber(currentVersion) + 1 then
  status = 'gap'
end

redis.call('SET', versionKey, tostring(incomingVersion))
return {status, currentVersion or ''}
`;

export class LiveFeedStateStore {
  public constructor(
    private readonly redis: RedisClientType,
    private readonly idempotencyTtlSeconds: number
  ) {}

  public async acceptEvent(envelope: BidAcceptedEnvelope): Promise<EventAcceptanceResult> {
    const processedKey = this.processedEventKey(envelope.eventId);
    const versionKey = this.auctionVersionKey(envelope.aggregateId);

    const result = (await this.redis.eval(acceptEventScript, {
      keys: [processedKey, versionKey],
      arguments: [String(envelope.aggregateVersion), String(this.idempotencyTtlSeconds)]
    })) as [string, string];

    const previousVersion = result[1] ? Number(result[1]) : null;

    if (!["accepted", "duplicate", "stale", "gap"].includes(result[0])) {
      throw new Error(`Unexpected Redis event acceptance status: ${result[0]}`);
    }

    return {
      status: result[0] as EventAcceptanceResult["status"],
      previousVersion
    };
  }

  public processedEventKey(eventId: string): string {
    return `live-feed:processed-event:${eventId}`;
  }

  public auctionVersionKey(auctionId: string): string {
    return `live-feed:auction-version:${auctionId}`;
  }
}
