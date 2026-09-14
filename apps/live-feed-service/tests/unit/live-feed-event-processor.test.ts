/**
 * Tests for live-feed event processing with framework-free application test doubles.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { LiveFeedEventProcessor } from '../../src/application/processors/live-feed-event-processor.js';
import type {
  LiveFeedPublisher,
  LiveFeedUpdate,
} from '../../src/application/ports/live-feed-publisher.js';
import type {
  EventAcceptanceResult,
  LiveStateStore,
} from '../../src/application/ports/live-state-store.js';
import type {
  AuctionClosedEnvelope,
  AuctionPurchasedEnvelope,
  AuctionCancelledEnvelope,
  BidAcceptedEnvelope,
  TenantStatusChangedEnvelope,
} from '../../src/domain/events.js';

const tenantId = 'aaaaaaaa-1111-4111-8111-111111111111';

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
      tenantId,
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

function purchaseEvent(auctionId = randomUUID()): AuctionPurchasedEnvelope {
  return {
    eventId: randomUUID(),
    eventType: 'AuctionPurchased',
    occurredAtUtc: new Date().toISOString(),
    aggregateType: 'Auction',
    aggregateId: auctionId,
    aggregateVersion: 12,
    correlationId: 'purchase-correlation',
    payload: {
      tenantId,
      auctionId,
      bidderId: 'buyer-123',
      finalPrice: 1000,
      purchasedAtUtc: new Date().toISOString(),
      auctionVersion: 12,
    },
  };
}

function closedEvent(auctionId: string): AuctionClosedEnvelope {
  return {
    eventId: randomUUID(),
    eventType: 'AuctionClosed',
    occurredAtUtc: new Date().toISOString(),
    aggregateType: 'Auction',
    aggregateId: auctionId,
    aggregateVersion: 12,
    correlationId: 'purchase-correlation',
    payload: {
      tenantId,
      auctionId,
      closedAtUtc: new Date().toISOString(),
      finalBidAmount: 1000,
      finalBidderId: 'buyer-123',
      auctionVersion: 12,
    },
  };
}

function cancelledEvent(auctionId = randomUUID()): AuctionCancelledEnvelope {
  return {
    eventId: randomUUID(),
    eventType: 'AuctionCancelled',
    occurredAtUtc: new Date().toISOString(),
    aggregateType: 'Auction',
    aggregateId: auctionId,
    aggregateVersion: 13,
    correlationId: 'cancel-correlation',
    payload: { tenantId, auctionId },
  };
}

function tenantStatusEvent(
  currentStatus: TenantStatusChangedEnvelope['payload']['currentStatus'] = 'Disabled',
  tenantVersion = 4,
): TenantStatusChangedEnvelope {
  const eventId = randomUUID();
  const occurredAtUtc = new Date().toISOString();
  return {
    eventId,
    eventType: 'TenantStatusChanged',
    occurredAtUtc,
    aggregateType: 'Tenant',
    aggregateId: tenantId,
    aggregateVersion: tenantVersion,
    correlationId: 'tenant-status-correlation',
    payload: {
      eventId,
      tenantId,
      previousStatus: currentStatus === 'Disabled' ? 'Active' : 'Disabled',
      currentStatus,
      tenantVersion,
      occurredAtUtc,
    },
  };
}

void test('accepted events publish the existing event name and payload through the port', async () => {
  const updates: LiveFeedUpdate[] = [];
  const publisher: LiveFeedPublisher = { publish: (update) => updates.push(update) };
  const envelope = event();
  const processor = new LiveFeedEventProcessor(
    publisher,
    stateStore({ status: 'accepted', previousVersion: 6 }),
  );

  const result = await processor.process(envelope);

  assert.equal(result.action, 'broadcast');
  assert.equal(updates.length, 1);
  assert.equal(updates[0].auctionId, envelope.aggregateId);
  assert.equal(updates[0].eventName, 'bid:accepted');
  assert.deepEqual(updates[0].payload, {
    auctionId: envelope.aggregateId,
    tenantId,
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

void test('AuctionPurchased publishes the explicit purchase event and final price', async () => {
  const updates: LiveFeedUpdate[] = [];
  const envelope = purchaseEvent();
  const processor = new LiveFeedEventProcessor(
    { publish: (update) => updates.push(update) },
    stateStore({ status: 'accepted', previousVersion: 11 }),
  );

  await processor.process(envelope);

  assert.equal(updates[0]?.eventName, 'auction:purchased');
  assert.deepEqual(updates[0]?.payload, {
    auctionId: envelope.aggregateId,
    tenantId,
    bidderId: 'buyer-123',
    finalPrice: 1000,
    auctionVersion: 12,
    purchasedAtUtc: envelope.payload.purchasedAtUtc,
    occurredAtUtc: envelope.occurredAtUtc,
    correlationId: 'purchase-correlation',
  });
});

void test('same-version purchase and close siblings are both published in either order', async () => {
  for (const order of ['purchase-first', 'close-first'] as const) {
    const updates: LiveFeedUpdate[] = [];
    const auctionId = randomUUID();
    let calls = 0;
    const processor = new LiveFeedEventProcessor(
      { publish: (update) => updates.push(update) },
      {
        acceptEvent: () => {
          calls++;
          return Promise.resolve({
            status: calls === 1 ? 'accepted' : 'same-version',
            previousVersion: calls === 1 ? 11 : 12,
          });
        },
      },
    );

    const events =
      order === 'purchase-first'
        ? [purchaseEvent(auctionId), closedEvent(auctionId)]
        : [closedEvent(auctionId), purchaseEvent(auctionId)];
    await processor.process(events[0]);
    await processor.process(events[1]);

    assert.deepEqual(
      updates.map((update) => update.eventName).sort(),
      ['auction:purchased', 'auction:closed'].sort(),
    );
    assert.equal(updates.length, 2);
  }
});

void test('AuctionCancelled publishes the cancellation event without terminal outcome data', async () => {
  const updates: LiveFeedUpdate[] = [];
  const envelope = cancelledEvent();
  const processor = new LiveFeedEventProcessor(
    { publish: (update) => updates.push(update) },
    stateStore({ status: 'accepted', previousVersion: 12 }),
  );

  await processor.process(envelope);

  assert.equal(updates[0]?.eventName, 'auction:cancelled');
  assert.deepEqual(updates[0]?.payload, {
    auctionId: envelope.aggregateId,
    tenantId,
    status: 'Cancelled',
    auctionVersion: 13,
    occurredAtUtc: envelope.occurredAtUtc,
    correlationId: envelope.correlationId,
  });
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

void test('accepted Disabled status evicts tenant rooms and duplicate delivery is ignored', async () => {
  const evicted: string[] = [];
  let calls = 0;
  const envelope = tenantStatusEvent();
  const processor = new LiveFeedEventProcessor(
    { publish: () => assert.fail('tenant status must not broadcast as an auction event') },
    {
      acceptEvent: () => Promise.reject(new Error('not an auction event')),
      acceptTenantStatusEvent: () => {
        calls++;
        return Promise.resolve({
          status: calls === 1 ? ('accepted' as const) : ('duplicate' as const),
          previousVersion: calls === 1 ? 3 : 4,
        });
      },
    },
    undefined,
    { evictTenantRooms: (value) => Promise.resolve(evicted.push(value)) },
  );

  assert.equal((await processor.process(envelope)).action, 'status-applied');
  assert.equal((await processor.process(envelope)).action, 'ignored');
  assert.deepEqual(evicted, [tenantId]);
});

void test('accepted Active and Suspended status events do not evict rooms', async () => {
  const evicted: string[] = [];
  const processor = new LiveFeedEventProcessor(
    { publish: () => assert.fail('tenant status must not broadcast') },
    {
      acceptEvent: () => Promise.reject(new Error('not an auction event')),
      acceptTenantStatusEvent: () =>
        Promise.resolve({ status: 'accepted' as const, previousVersion: null }),
    },
    undefined,
    { evictTenantRooms: (value) => Promise.resolve(evicted.push(value)) },
  );

  await processor.process(tenantStatusEvent('Active', 5));
  await processor.process(tenantStatusEvent('Suspended', 6));
  assert.deepEqual(evicted, []);
});

void test('tenant status Redis failure prevents room eviction', async () => {
  const evicted: string[] = [];
  const failure = new Error('Redis unavailable');
  const processor = new LiveFeedEventProcessor(
    { publish: () => assert.fail('tenant status must not broadcast') },
    {
      acceptEvent: () => Promise.reject(new Error('not an auction event')),
      acceptTenantStatusEvent: () => Promise.reject(failure),
    },
    undefined,
    { evictTenantRooms: (value) => Promise.resolve(evicted.push(value)) },
  );

  await assert.rejects(() => processor.process(tenantStatusEvent()), failure);
  assert.deepEqual(evicted, []);
});
