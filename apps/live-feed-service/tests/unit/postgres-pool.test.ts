/**
 * Tests bounded pool lifecycle behavior without requiring a database connection.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { PostgresPool } from '../../src/infrastructure/database/postgres-pool.js';

void test('PostgresPool exposes safe counters and closes idempotently', async () => {
  const pool = new PostgresPool({
    connectionString: 'postgresql://invalid:invalid@127.0.0.1:1/invalid',
    max: 1,
    idleTimeoutMillis: 50,
    connectionTimeoutMillis: 25,
  });

  assert.deepEqual(pool.status(), { totalCount: 0, idleCount: 0, waitingCount: 0 });
  await pool.close();
  await pool.close();
});
