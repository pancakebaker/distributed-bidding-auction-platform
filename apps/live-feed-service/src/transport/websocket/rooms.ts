/**
 * Socket.IO room naming and subscription validation for auction-specific live updates.
 */
import { isUuid } from '../../domain/events.js';

/**
 * Builds the server-owned Socket.IO room name for a validated auction identifier.
 */
export function auctionRoom(tenantId: string, auctionId: string): string {
  return `tenant:${tenantId}:auction:${auctionId}`;
}

/** Returns the exact prefix shared by all public auction rooms for a tenant. */
export function auctionRoomPrefix(tenantId: string): string {
  return `tenant:${tenantId}:auction:`;
}

/**
 * Extracts a syntactically valid auction ID from a client subscription request.
 */
export type AuctionSubscription = { auctionId: string; tenantId?: string };

/** Parses and validates an auction subscription payload from a Socket.IO client. */
export function parseAuctionSubscription(value: unknown): AuctionSubscription | null {
  if (typeof value === 'string' && isUuid(value)) {
    return { auctionId: value };
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'auctionId' in value &&
    typeof value.auctionId === 'string' &&
    isUuid(value.auctionId)
  ) {
    const tenantId =
      'tenantId' in value && typeof value.tenantId === 'string' ? value.tenantId : undefined;
    if (tenantId !== undefined && !isUuid(tenantId)) {
      return null;
    }
    return { auctionId: value.auctionId, tenantId };
  }

  return null;
}
