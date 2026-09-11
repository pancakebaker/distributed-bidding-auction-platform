/**
 * PostgreSQL adapter for durable, non-authoritative live-feed operational history.
 */
import { ApplicationError } from '../../application/errors/application-error.js';
import type {
  LiveFeedHistoryFilters,
  LiveFeedHistoryRecord,
  LiveFeedHistoryResult,
  LiveFeedHistoryRow,
} from '../../application/history/live-feed-history-types.js';
import type {
  LiveFeedHistoryStore,
  LiveFeedHistoryStoreStatus,
} from '../../application/ports/live-feed-history-store.js';
import type { PostgresPool } from './postgres-pool.js';

type HistoryRow = {
  id: number;
  event_id: string;
  auction_id: string | null;
  event_type: string;
  aggregate_version: number | null;
  correlation_id: string | null;
  occurred_at: Date | null;
  processed_at: Date;
  outcome: LiveFeedHistoryRecord['outcome'];
};

/**
 * Implements idempotent history writes and bounded parameterized queries.
 */
export class PostgresLiveFeedHistoryStore implements LiveFeedHistoryStore {
  public constructor(private readonly pool: PostgresPool) {}

  /**
   * Inserts one row and ignores normal duplicate delivery of the same event.
   */
  public async record(record: LiveFeedHistoryRecord): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO live_feed_history (
          event_id, auction_id, event_type, aggregate_version, correlation_id, occurred_at, processed_at, outcome
        ) VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz, $8)
        ON CONFLICT (event_id) DO NOTHING`,
        [
          record.eventId,
          record.auctionId ?? null,
          record.eventType,
          record.aggregateVersion ?? null,
          record.correlationId ?? null,
          record.occurredAt ?? null,
          record.processedAt,
          record.outcome,
        ],
      );
    } catch (error) {
      throw new ApplicationError(
        'Live-feed history persistence is unavailable.',
        503,
        'history_unavailable',
        {
          cause: error,
        },
      );
    }
  }

  /**
   * Queries recent history using only parameterized values and bounded limits.
   */
  public async query(filters: LiveFeedHistoryFilters): Promise<LiveFeedHistoryResult> {
    const conditions = ['processed_at >= $1::timestamptz', 'processed_at <= $2::timestamptz'];
    const values: unknown[] = [filters.from, filters.to];

    if (filters.auctionId) {
      values.push(filters.auctionId);
      conditions.push(`auction_id = $${values.length}`);
    }

    if (filters.eventType) {
      values.push(filters.eventType);
      conditions.push(`event_type = $${values.length}`);
    }

    if (filters.outcome) {
      values.push(filters.outcome);
      conditions.push(`outcome = $${values.length}`);
    }

    values.push(filters.limit);
    let result;
    try {
      result = await this.pool.query<HistoryRow>(
        `SELECT id, event_id, auction_id, event_type, aggregate_version, correlation_id,
                occurred_at, processed_at, outcome
         FROM live_feed_history
         WHERE ${conditions.join(' AND ')}
         ORDER BY processed_at DESC, id DESC
         LIMIT $${values.length}`,
        values,
      );
    } catch (error) {
      throw new ApplicationError('Live-feed history is unavailable.', 503, 'history_unavailable', {
        cause: error,
      });
    }

    const rows = result.rows.map(toHistoryRow);
    return { filters, rows, count: rows.length };
  }

  /**
   * Returns safe pool counters.
   */
  public status(): LiveFeedHistoryStoreStatus {
    const status = this.pool.status();
    return { configured: true, available: true, ...status };
  }

  /**
   * Closes the underlying PostgreSQL pool.
   */
  public close(): Promise<void> {
    return this.pool.close();
  }
}

/**
 * No-op degraded adapter used when history is not configured or unavailable.
 */
export class UnavailableLiveFeedHistoryStore implements LiveFeedHistoryStore {
  /**
   * Accepts history without affecting live-feed processing when PostgreSQL is unavailable.
   */
  public record(_record: LiveFeedHistoryRecord): Promise<void> {
    return Promise.resolve();
  }

  /**
   * Rejects admin queries with a safe service-unavailable error.
   */
  public query(_filters: LiveFeedHistoryFilters): Promise<LiveFeedHistoryResult> {
    return Promise.reject(
      new ApplicationError('Live-feed history is unavailable.', 503, 'history_unavailable'),
    );
  }

  /**
   * Reports that durable history is not configured.
   */
  public status(): LiveFeedHistoryStoreStatus {
    return { configured: false, available: false, totalCount: 0, idleCount: 0, waitingCount: 0 };
  }

  /**
   * No-op close for the degraded adapter.
   */
  public close(): Promise<void> {
    return Promise.resolve();
  }
}

function toHistoryRow(row: HistoryRow): LiveFeedHistoryRow {
  return {
    id: row.id,
    eventId: row.event_id,
    auctionId: row.auction_id ?? undefined,
    eventType: row.event_type,
    aggregateVersion: row.aggregate_version ?? undefined,
    correlationId: row.correlation_id ?? undefined,
    occurredAt: row.occurred_at?.toISOString(),
    processedAt: row.processed_at.toISOString(),
    outcome: row.outcome,
  };
}
