/**
 * Application-facing state-store contract for live-feed idempotency and version decisions.
 */
import type { LiveFeedEnvelope } from '../../domain/events.js';

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

/**
 * Narrow state-store port used by the application event processor.
 */
export interface LiveStateStore {
  /**
   * Applies the existing idempotency and aggregate-version decision for an event.
   */
  acceptEvent(envelope: LiveFeedEnvelope): Promise<EventAcceptanceResult>;
}
