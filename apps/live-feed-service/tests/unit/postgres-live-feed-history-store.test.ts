/**
 * Tests parameterized, idempotent PostgreSQL history adapter behavior with a pool double.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { PostgresPool } from '../../src/infrastructure/database/postgres-pool.js';
import { PostgresLiveFeedHistoryStore } from '../../src/infrastructure/database/postgres-live-feed-history-store.js';
import type { LiveFeedHistoryRecord } from '../../src/application/history/live-feed-history-types.js';

const record: LiveFeedHistoryRecord = {
  eventId: 'event-1',
  auctionId: 'auction-1',
  eventType: 'BidAccepted',
  aggregateVersion: 4,
  correlationId: 'correlation-1',
  occurredAt: '2026-01-01T00:00:00.000Z',
  processedAt: '2026-01-01T00:00:01.000Z',
  outcome: 'applied',
};

void test('history adapter inserts with ON CONFLICT DO NOTHING and parameter values', async () => {
  let queryText = '';
  let queryValues: readonly unknown[] = [];
  const pool = {
    query: (text: string, values: readonly unknown[]) => {
      queryText = text;
      queryValues = values;
      return Promise.resolve({ rows: [], rowCount: 1 });
    },
    status: () => ({ totalCount: 1, idleCount: 1, waitingCount: 0 }),
    close: () => Promise.resolve(),
  } as unknown as PostgresPool;
  const store = new PostgresLiveFeedHistoryStore(pool);

  await store.record(record);

  assert.match(queryText, /ON CONFLICT \(event_id\) DO NOTHING/);
  assert.doesNotMatch(queryText, /event-1/);
  assert.deepEqual(queryValues, [
    'event-1',
    'auction-1',
    'BidAccepted',
    4,
    'correlation-1',
    '2026-01-01T00:00:00.000Z',
    '2026-01-01T00:00:01.000Z',
    'applied',
  ]);
});

void test('history adapter parameterizes filters and maps deterministic rows', async () => {
  let queryText = '';
  let queryValues: readonly unknown[] = [];
  const pool = {
    query: (text: string, values: readonly unknown[]) => {
      queryText = text;
      queryValues = values;
      return Promise.resolve({
        rows: [
          {
            id: 9,
            event_id: 'event-1',
            auction_id: 'auction-1',
            event_type: 'BidAccepted',
            aggregate_version: 4,
            correlation_id: 'correlation-1',
            occurred_at: new Date('2026-01-01T00:00:00.000Z'),
            processed_at: new Date('2026-01-01T00:00:01.000Z'),
            outcome: 'applied',
          },
        ],
        rowCount: 1,
      });
    },
    status: () => ({ totalCount: 1, idleCount: 1, waitingCount: 0 }),
    close: () => Promise.resolve(),
  } as unknown as PostgresPool;
  const store = new PostgresLiveFeedHistoryStore(pool);
  const result = await store.query({
    from: '2026-01-01T00:00:00.000Z',
    to: '2026-01-02T00:00:00.000Z',
    auctionId: 'auction-1',
    eventType: 'BidAccepted',
    outcome: 'applied',
    limit: 20,
  });

  assert.match(queryText, /WHERE/);
  assert.match(queryText, /LIMIT \$6/);
  assert.doesNotMatch(queryText, /auction-1/);
  assert.deepEqual(queryValues, [
    '2026-01-01T00:00:00.000Z',
    '2026-01-02T00:00:00.000Z',
    'auction-1',
    'BidAccepted',
    'applied',
    20,
  ]);
  assert.equal(result.rows[0]?.eventId, 'event-1');
  assert.equal(result.rows[0]?.processedAt, '2026-01-01T00:00:01.000Z');
});
