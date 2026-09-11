import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateTypes, integrationEventTypes } from '../../src/domain/events.js';
import { integrationEventRoutingKeys } from '../../src/domain/transport.js';

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
