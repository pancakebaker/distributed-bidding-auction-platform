/**
 * Safe application types for durable live-feed operational history.
 */

/**
 * Outcome recorded after the live-feed processor completes its normal decision.
 */
export type LiveFeedHistoryOutcome = 'applied' | 'stale' | 'ignored' | 'error';

/**
 * Safe metadata persisted for one downstream live-feed processing observation.
 */
export type LiveFeedHistoryRecord = {
  eventId: string;
  auctionId?: string;
  eventType: string;
  aggregateVersion?: number;
  correlationId?: string;
  occurredAt?: string;
  processedAt: string;
  outcome: LiveFeedHistoryOutcome;
};

/**
 * Bounded, validated filters used by admin history queries and exports.
 */
export type LiveFeedHistoryFilters = {
  from: string;
  to: string;
  auctionId?: string;
  eventType?: string;
  outcome?: LiveFeedHistoryOutcome;
  limit: number;
};

/**
 * Row returned by a durable history query.
 */
export type LiveFeedHistoryRow = LiveFeedHistoryRecord & {
  id: number;
};

/**
 * Result returned by a bounded history query.
 */
export type LiveFeedHistoryResult = {
  filters: LiveFeedHistoryFilters;
  rows: LiveFeedHistoryRow[];
  count: number;
};
