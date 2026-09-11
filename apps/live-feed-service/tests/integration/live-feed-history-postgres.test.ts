/**
 * Optional PostgreSQL integration coverage for the dedicated live-feed history table.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { PostgresPool } from '../../src/infrastructure/database/postgres-pool.js';
import { PostgresLiveFeedHistoryStore } from '../../src/infrastructure/database/postgres-live-feed-history-store.js';

const databaseUrl = process.env.LIVE_FEED_DATABASE_URL;

void test(
  'PostgreSQL live-feed history supports idempotency, filters, ordering, and limits',
  { skip: !databaseUrl },
  async () => {
    if (!databaseUrl) {
      return;
    }

    const pool = new PostgresPool({
      connectionString: databaseUrl,
      max: 1,
      connectionTimeoutMillis: 1000,
    });
    const store = new PostgresLiveFeedHistoryStore(pool);
    const suffix = randomUUID();
    const processedAt = new Date('2026-01-01T00:00:00.000Z');

    try {
      await store.record({
        eventId: `phase9-test-${suffix}`,
        auctionId: 'phase9-auction',
        eventType: 'BidAccepted',
        aggregateVersion: 1,
        correlationId: 'phase9-correlation',
        occurredAt: processedAt.toISOString(),
        processedAt: processedAt.toISOString(),
        outcome: 'applied',
      });
      await store.record({
        eventId: `phase9-test-${suffix}`,
        auctionId: 'phase9-auction',
        eventType: 'BidAccepted',
        aggregateVersion: 1,
        correlationId: 'phase9-correlation',
        occurredAt: processedAt.toISOString(),
        processedAt: processedAt.toISOString(),
        outcome: 'applied',
      });

      const result = await store.query({
        from: '2025-12-31T00:00:00.000Z',
        to: '2026-01-02T00:00:00.000Z',
        auctionId: 'phase9-auction',
        eventType: 'BidAccepted',
        outcome: 'applied',
        limit: 10,
      });

      assert.equal(result.count, 1);
      assert.equal(result.rows[0]?.eventId, `phase9-test-${suffix}`);
    } finally {
      await pool
        .query('DELETE FROM live_feed_history WHERE event_id = $1', [`phase9-test-${suffix}`])
        .catch(() => undefined);
      await pool.close();
    }
  },
);
