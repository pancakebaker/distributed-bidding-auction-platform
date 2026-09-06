/**
 * Socket.IO room naming and subscription validation for auction-specific live updates.
 */
import { isUuid } from './events.js';

/**
 * Builds the server-owned Socket.IO room name for a validated auction identifier.
 */
export function auctionRoom(auctionId: string): string {
  return `auction:${auctionId}`;
}

/**
 * Extracts a syntactically valid auction ID from a client subscription request.
 */
export function parseAuctionSubscription(value: unknown): string | null {
  if (typeof value === 'string' && isUuid(value)) {
    return value;
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'auctionId' in value &&
    typeof value.auctionId === 'string' &&
    isUuid(value.auctionId)
  ) {
    return value.auctionId;
  }

  return null;
}
