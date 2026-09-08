/**
 * Application-facing port for best-effort durable live-feed operational history.
 */
import type {
  LiveFeedHistoryFilters,
  LiveFeedHistoryRecord,
  LiveFeedHistoryResult,
} from '../history/live-feed-history-types.js';

/**
 * Safe pool status exposed only to diagnostics and the admin dashboard.
 */
export type LiveFeedHistoryStoreStatus = {
  configured: boolean;
  available: boolean;
  totalCount: number;
  idleCount: number;
  waitingCount: number;
};

/**
 * Narrow persistence/query boundary that hides PostgreSQL types from application code.
 */
export interface LiveFeedHistoryStore {
  /**
   * Persists one operational record idempotently.
   */
  record(record: LiveFeedHistoryRecord): Promise<void>;

  /**
   * Returns a bounded, deterministically ordered history result.
   */
  query(filters: LiveFeedHistoryFilters): Promise<LiveFeedHistoryResult>;

  /**
   * Returns safe pool status without exposing connection details.
   */
  status(): LiveFeedHistoryStoreStatus;

  /**
   * Closes the underlying resource once.
   */
  close(): Promise<void>;
}
