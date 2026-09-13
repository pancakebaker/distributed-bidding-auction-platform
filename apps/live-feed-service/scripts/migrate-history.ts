/**
 * Applies the idempotent live-feed history SQL migration using the configured PostgreSQL URL.
 */
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PostgresPool } from '../src/infrastructure/database/postgres-pool.js';
import { loadConfig } from '../src/config/config.js';
import { loadLocalEnvironment } from '../src/config/load-local-env.js';

loadLocalEnvironment();
const config = loadConfig();
if (!config.liveFeedDatabaseUrl) {
  throw new Error('LIVE_FEED_DATABASE_URL must be configured to apply the history migration.');
}

const migrationDirectory = resolve(process.cwd(), 'migrations');
const migrationFiles = (await readdir(migrationDirectory))
  .filter((file) => /^\d+_.*\.sql$/.test(file))
  .sort();
const pool = new PostgresPool({
  connectionString: config.liveFeedDatabaseUrl,
  max: 1,
  idleTimeoutMillis: config.liveFeedDbIdleTimeoutMs,
  connectionTimeoutMillis: config.liveFeedDbConnectionTimeoutMs,
  application_name: 'live-feed-history-migration',
});

try {
  for (const migrationFile of migrationFiles) {
    await pool.query(await readFile(resolve(migrationDirectory, migrationFile), 'utf8'));
    console.info(`Applied live-feed history migration ${migrationFile}.`);
  }
} finally {
  await pool.close();
}
