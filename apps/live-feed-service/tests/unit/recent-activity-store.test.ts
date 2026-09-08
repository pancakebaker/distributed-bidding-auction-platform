/**
 * Tests the bounded, non-durable operational activity buffer.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { RecentActivityStore } from '../../src/application/diagnostics/recent-activity-store.js';

const activity = (eventId: string) => ({
  eventId,
  eventType: 'BidAccepted',
  auctionId: 'auction-id',
  aggregateVersion: 1,
  correlationId: 'correlation-id',
  receivedAt: new Date().toISOString(),
  outcome: 'applied' as const,
});

void test('activity store keeps newest items first and evicts oldest entries', () => {
  const store = new RecentActivityStore(2);
  store.append(activity('one'));
  store.append(activity('two'));
  store.append(activity('three'));

  assert.deepEqual(
    store.snapshot().map((item) => item.eventId),
    ['three', 'two'],
  );
});

void test('activity snapshots do not leak mutable buffer state', () => {
  const store = new RecentActivityStore(2);
  store.append(activity('one'));

  const snapshot = store.snapshot();
  (snapshot as Array<{ eventId: string }>)[0].eventId = 'changed';

  assert.equal(store.snapshot()[0]?.eventId, 'one');
});
