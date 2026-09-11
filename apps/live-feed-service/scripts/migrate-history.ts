/**
 * Applies the idempotent live-feed history SQL migration using the configured PostgreSQL URL.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PostgresPool } from '../src/infrastructure/database/postgres-pool.js';
import { loadConfig } from '../src/config/config.js';
import { loadLocalEnvironment } from '../src/config/load-local-env.js';

loadLocalEnvironment();
const config = loadConfig();
if (!config.liveFeedDatabaseUrl) {
  throw new Error('LIVE_FEED_DATABASE_URL must be configured to apply the history migration.');
}

const sql = await readFile(
  resolve(process.cwd(), 'migrations/001_create_live_feed_history.sql'),
  'utf8',
);
const pool = new PostgresPool({
  connectionString: config.liveFeedDatabaseUrl,
  max: 1,
  idleTimeoutMillis: config.liveFeedDbIdleTimeoutMs,
  connectionTimeoutMillis: config.liveFeedDbConnectionTimeoutMs,
  application_name: 'live-feed-history-migration',
});

try {
  await pool.query(sql);
  console.info('Live-feed history migration applied.');
} finally {
  await pool.close();
}
