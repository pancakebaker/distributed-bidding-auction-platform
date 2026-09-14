/** Application service for the authoritative decision before a room join. */

import type { LiveFeedAccessDecision, LiveFeedAccessPort } from './ports/live-feed-access.js';

/** Application service for the authoritative admission decision before a room join. */
export class LiveFeedSubscriptionAuthorizer {
  public constructor(private readonly access: LiveFeedAccessPort) {}

  /** Rechecks the trusted Bidding boundary for every subscription request. */
  public authorize(auctionId: string): Promise<LiveFeedAccessDecision> {
    return this.access.canExposeAuctionLiveFeed(auctionId);
  }
}
