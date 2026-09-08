/**
 * Tests for live-feed event processing with framework-free application test doubles.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { LiveFeedEventProcessor } from '../../src/application/processors/live-feed-event-processor.js';
import type { LiveFeedPublisher, LiveFeedUpdate } from '../../src/application/ports/live-feed-publisher.js';
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

void test('accepted events publish the existing event name and payload through the port', async () => {
  const updates: LiveFeedUpdate[] = [];
  const publisher: LiveFeedPublisher = { publish: (update) => updates.push(update) };
  const envelope = event();
  const processor = new LiveFeedEventProcessor(publisher, stateStore({ status: 'accepted', previousVersion: 6 }));

  const result = await processor.process(envelope);

  assert.equal(result.action, 'broadcast');
  assert.equal(updates.length, 1);
  assert.equal(updates[0].auctionId, envelope.aggregateId);
  assert.equal(updates[0].eventName, 'bid:accepted');
  assert.deepEqual(updates[0].payload, {
    auctionId: envelope.aggregateId,
    bidId: envelope.payload.bidId,
    bidderId: envelope.payload.bidderId,
    amount: envelope.payload.amount,
    auctionVersion: envelope.aggregateVersion,
    occurredAtUtc: envelope.occurredAtUtc,
    correlationId: envelope.correlationId,
  });
});

void test('stale events are ignored without publishing', async () => {
  const updates: LiveFeedUpdate[] = [];
  const processor = new LiveFeedEventProcessor(
    { publish: (update) => updates.push(update) },
    stateStore({ status: 'stale', previousVersion: 8 }),
  );

  const envelope = event();
  const result = await processor.process(envelope);

  assert.deepEqual(result, {
    action: 'ignored',
    reason: 'stale',
    eventId: envelope.eventId,
    aggregateId: envelope.aggregateId,
    aggregateVersion: 7,
  });
  assert.equal(updates.length, 0);
});

void test('state-store errors propagate through the application boundary', async () => {
  const failure = new Error('state store unavailable');
  const processor = new LiveFeedEventProcessor(
    { publish: () => assert.fail('publisher should not be called') },
    {
      acceptEvent: () => Promise.reject(failure),
    },
  );

  await assert.rejects(
    () => processor.process(event()),
    (error: unknown) => error === failure,
  );
});
