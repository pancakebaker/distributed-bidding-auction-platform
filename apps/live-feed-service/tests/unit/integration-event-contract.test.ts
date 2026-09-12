import assert from 'node:assert/strict';
import test from 'node:test';
import {
  aggregateTypes,
  integrationEventTypes,
  validateLiveFeedEnvelope,
} from '../../src/domain/events.js';
import {
  adminSocketEvents,
  adminSocketRooms,
  auctionSocketEvents,
  integrationEventRoutingKeys,
} from '../../src/domain/transport.js';

void test('integration event wire values remain stable', () => {
  assert.deepEqual(integrationEventTypes, {
    bidAccepted: 'BidAccepted',
    auctionClosed: 'AuctionClosed',
    winnerSelected: 'WinnerSelected',
    auctionPurchased: 'AuctionPurchased',
  });
  assert.equal(aggregateTypes.auction, 'Auction');
  assert.deepEqual(integrationEventRoutingKeys, {
    bidAccepted: 'auction.bid.accepted',
    auctionClosed: 'auction.closed',
    winnerSelected: 'auction.winner.selected',
    auctionPurchased: 'auction.purchased',
  });
});

void test('Socket.IO transport wire values remain stable', () => {
  assert.deepEqual(auctionSocketEvents, {
    bidAccepted: 'bid:accepted',
    auctionClosed: 'auction:closed',
    winnerSelected: 'winner:selected',
    auctionPurchased: 'auction:purchased',
    subscribe: 'auction:subscribe',
    unsubscribe: 'auction:unsubscribe',
  });
  assert.deepEqual(adminSocketEvents, {
    subscribe: 'admin:subscribe',
    activity: 'admin:activity',
    subscriptionError: 'subscription:error',
  });
  assert.equal(adminSocketRooms.liveFeed, 'admin:live-feed');
});

function purchaseEnvelope(overrides: Record<string, unknown> = {}) {
  const auctionId = '11111111-1111-1111-1111-111111111111';
  return {
    eventId: '22222222-2222-2222-2222-222222222222',
    eventType: 'AuctionPurchased',
    occurredAtUtc: '2026-01-01T00:00:00.000Z',
    aggregateType: 'Auction',
    aggregateId: auctionId,
    aggregateVersion: 12,
    correlationId: 'correlation-12',
    payload: {
      auctionId,
      bidderId: 'buyer-123',
      finalPrice: 1000,
      purchasedAtUtc: '2026-01-01T00:00:00.000Z',
      auctionVersion: 12,
    },
    ...overrides,
  };
}

void test('valid AuctionPurchased envelopes preserve the producer contract', () => {
  const envelope = validateLiveFeedEnvelope(purchaseEnvelope());

  assert.equal(envelope.eventType, 'AuctionPurchased');
  assert.equal(envelope.aggregateVersion, 12);
  assert.equal(envelope.payload.bidderId, 'buyer-123');
  assert.equal(envelope.payload.finalPrice, 1000);
});

void test('malformed AuctionPurchased payloads are rejected', () => {
  assert.throws(() => validateLiveFeedEnvelope(purchaseEnvelope({ payload: {} })), /auctionId/);
  assert.throws(
    () =>
      validateLiveFeedEnvelope(
        purchaseEnvelope({ payload: { ...purchaseEnvelope().payload as object, finalPrice: '1000' } }),
      ),
    /finalPrice/,
  );
  assert.throws(
    () =>
      validateLiveFeedEnvelope(
        purchaseEnvelope({ payload: { ...purchaseEnvelope().payload as object, auctionVersion: 11 } }),
      ),
    /auctionVersion/,
  );
});

void test('unknown event types remain rejected', () => {
  assert.throws(
    () => validateLiveFeedEnvelope(purchaseEnvelope({ eventType: 'UnknownEvent' })),
    /Unsupported eventType/,
  );
});
