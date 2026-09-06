import { isUuid } from './events.js';

export function auctionRoom(auctionId: string): string {
  return `auction:${auctionId}`;
}

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
