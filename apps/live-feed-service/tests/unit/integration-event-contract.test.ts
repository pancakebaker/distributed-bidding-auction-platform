import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateTypes, integrationEventTypes } from '../../src/domain/events.js';

void test('integration event wire values remain stable', () => {
  assert.deepEqual(integrationEventTypes, {
    bidAccepted: 'BidAccepted',
    auctionClosed: 'AuctionClosed',
    winnerSelected: 'WinnerSelected',
  });
  assert.equal(aggregateTypes.auction, 'Auction');
});
