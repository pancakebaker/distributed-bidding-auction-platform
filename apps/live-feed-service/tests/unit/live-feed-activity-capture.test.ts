/**
 * Tests best-effort operational activity capture at the processor boundary.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { LiveFeedEventProcessor } from '../../src/application/processors/live-feed-event-processor.js';
import { RecentActivityStore } from '../../src/application/diagnostics/recent-activity-store.js';
import type { LiveFeedPublisher } from '../../src/application/ports/live-feed-publisher.js';
import type { EventAcceptanceResult, LiveStateStore } from '../../src/application/ports/live-state-store.js';
import type { BidAcceptedEnvelope } from '../../src/domain/events.js';

function event(): BidAcceptedEnvelope {
  const auctionId = randomUUID();
  return {
    eventId: randomUUID(),
    eventType: 'BidAccepted',
    occurredAtUtc: new Date().toISOString(),
    aggregateType: 'Auction',
    aggregateId: auctionId,
    aggregateVersion: 7,
    correlationId: 'correlation-test',
    payload: {
      bidId: randomUUID(),
      auctionId,
      bidderId: 'alice',
      amount: 125,
      auctionVersion: 7,
    },
  };
}

function stateStore(result: EventAcceptanceResult): LiveStateStore {
  return { acceptEvent: () => Promise.resolve(result) };
}

void test('applied and stale outcomes are recorded without changing processor results', async () => {
  const store = new RecentActivityStore(10);
  const publisher: LiveFeedPublisher = { publish: () => undefined };
  const appliedEvent = event();
  const staleEvent = event();
  const processor = new LiveFeedEventProcessor(
    publisher,
    stateStore({ status: 'accepted', previousVersion: 6 }),
    store,
  );

  const applied = await processor.process(appliedEvent);
  const staleProcessor = new LiveFeedEventProcessor(
    publisher,
    stateStore({ status: 'stale', previousVersion: 8 }),
    store,
  );
  const stale = await staleProcessor.process(staleEvent);

  assert.equal(applied.action, 'broadcast');
  assert.equal(stale.action, 'ignored');
  assert.deepEqual(
    store.snapshot().map((item) => item.outcome),
    ['stale', 'applied'],
  );
});

void test('activity recorder failure does not affect processing', async () => {
  const failureRecorder = {
    record: () => {
      throw new Error('observer failed');
    },
  };
  const processor = new LiveFeedEventProcessor(
    { publish: () => undefined },
    stateStore({ status: 'accepted', previousVersion: 6 }),
    failureRecorder,
  );

  const result = await processor.process(event());
  assert.equal(result.action, 'broadcast');
});
