/** Decision returned by the trusted Bidding Service boundary. */
export type LiveFeedAccessDecision =
  | { kind: 'allowed' }
  | { kind: 'denied' }
  | { kind: 'not_found' }
  | { kind: 'unavailable' }
  | { kind: 'unauthorized_internal_service' };

/** Application-facing port for authoritative auction Live Feed admission. */
export interface LiveFeedAccessPort {
  canExposeAuctionLiveFeed(auctionId: string): Promise<LiveFeedAccessDecision>;
}
