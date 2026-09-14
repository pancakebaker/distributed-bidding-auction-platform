/**
 * Application-facing state-store contract for live-feed idempotency and version decisions.
 */
import type { LiveFeedEnvelope, TenantStatusChangedEnvelope } from '../../domain/events.js';

/**
 * Outcomes returned when an event is checked against live-feed state.
 */
export type EventAcceptanceStatus = 'accepted' | 'duplicate' | 'stale' | 'same-version' | 'gap';

/**
 * State-store decision with the previously observed aggregate version when available.
 */
export type EventAcceptanceResult = {
  status: EventAcceptanceStatus;
  previousVersion: number | null;
};

/** Outcome of the Redis-backed tenant status version guard. */
export type TenantStatusAcceptanceResult = {
  status: 'accepted' | 'duplicate' | 'stale';
  previousVersion: number | null;
};

/** Minimal non-authoritative Redis projection of the latest auction outcome. */
export type LiveAuctionProjection = {
  tenantId: string;
  auctionId: string;
  aggregateVersion: number;
  status?: 'Closed' | 'Cancelled';
  currentBidAmount?: number;
  currentBidderId?: string;
  finalWinnerId?: string;
  finalPrice?: number;
  purchasedAtUtc?: string;
};

/**
 * Narrow state-store port used by the application event processor.
 */
export interface LiveStateStore {
  /**
   * Applies the existing idempotency and aggregate-version decision for an event.
   */
  acceptEvent(
    envelope: Exclude<LiveFeedEnvelope, TenantStatusChangedEnvelope>,
  ): Promise<EventAcceptanceResult>;

  /** Atomically accepts only a newer tenant status event. */
  acceptTenantStatusEvent?(
    envelope: TenantStatusChangedEnvelope,
  ): Promise<TenantStatusAcceptanceResult>;

  /** Releases a tenant status reservation when revocation cannot be completed. */
  rollbackTenantStatusEvent?(envelope: TenantStatusChangedEnvelope): Promise<void>;

  /** Reads the optional non-authoritative auction projection maintained by the store. */
  getProjection?(auctionId: string): Promise<LiveAuctionProjection | null>;
}
