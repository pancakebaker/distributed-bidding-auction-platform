/**
 * Application-facing publisher contract for live-feed client updates.
 */
import type {
  AuctionPurchasedSocketPayload,
  AuctionClosedSocketPayload,
  BidAcceptedSocketPayload,
  WinnerSelectedSocketPayload,
} from '../../domain/events.js';
import type { auctionSocketEvents } from '../../domain/transport.js';

/**
 * Names of the existing browser-facing live-feed events.
 */
export type LiveFeedSocketEvent =
  | typeof auctionSocketEvents.bidAccepted
  | typeof auctionSocketEvents.auctionClosed
  | typeof auctionSocketEvents.winnerSelected
  | typeof auctionSocketEvents.auctionPurchased;

/**
 * Existing browser-facing live-feed payload union.
 */
export type LiveFeedSocketPayload =
  | BidAcceptedSocketPayload
  | AuctionClosedSocketPayload
  | WinnerSelectedSocketPayload
  | AuctionPurchasedSocketPayload;

/**
 * Update passed from application processing to a transport publisher.
 */
export type LiveFeedUpdate = {
  auctionId: string;
  eventName: LiveFeedSocketEvent;
  payload: LiveFeedSocketPayload;
};

/**
 * Narrow publisher port used by the application event processor.
 */
export interface LiveFeedPublisher {
  /**
   * Publishes an already-shaped live-feed update without exposing transport details.
   */
  publish(update: LiveFeedUpdate): void;
}
