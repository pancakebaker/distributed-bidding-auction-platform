import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateTypes, integrationEventTypes } from '../../src/domain/events.js';
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
  });
  assert.equal(aggregateTypes.auction, 'Auction');
  assert.deepEqual(integrationEventRoutingKeys, {
    bidAccepted: 'auction.bid.accepted',
    auctionClosed: 'auction.closed',
    winnerSelected: 'auction.winner.selected',
  });
});

void test('Socket.IO transport wire values remain stable', () => {
  assert.deepEqual(auctionSocketEvents, {
    bidAccepted: 'bid:accepted',
    auctionClosed: 'auction:closed',
    winnerSelected: 'winner:selected',
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
