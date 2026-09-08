/**
 * Composition helper for optional PostgreSQL-backed live-feed history.
 */
import type { LiveFeedConfig } from '../../config/config.js';
import type { LiveFeedHistoryStore } from '../../application/ports/live-feed-history-store.js';
import { PostgresPool } from './postgres-pool.js';
import { PostgresLiveFeedHistoryStore, UnavailableLiveFeedHistoryStore } from './postgres-live-feed-history-store.js';

/**
 * Creates one configured pool or a degraded no-op history store.
 */
export function createLiveFeedHistoryStore(config: LiveFeedConfig): LiveFeedHistoryStore {
  if (!config.liveFeedDatabaseUrl) {
    return new UnavailableLiveFeedHistoryStore();
  }

  const pool = new PostgresPool({
    connectionString: config.liveFeedDatabaseUrl,
    max: config.liveFeedDbPoolMax,
    idleTimeoutMillis: config.liveFeedDbIdleTimeoutMs,
    connectionTimeoutMillis: config.liveFeedDbConnectionTimeoutMs,
    application_name: 'live-feed-service',
  });

  return new PostgresLiveFeedHistoryStore(pool);
}
