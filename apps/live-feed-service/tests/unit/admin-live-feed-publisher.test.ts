/**
 * Tests the isolated admin Socket.IO operational activity publisher.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  adminActivityEvent,
  adminLiveFeedRoom,
  SocketIoAdminLiveFeedPublisher,
} from '../../src/transport/websocket/admin-live-feed-publisher.js';

void test('admin publisher emits safe activity only to the admin room', () => {
  const calls: Array<{ room: string; event: string; payload: unknown }> = [];
  const io = {
    to: (room: string) => ({
      emit: (event: string, payload: unknown) => calls.push({ room, event, payload }),
    }),
  };
  const publisher = new SocketIoAdminLiveFeedPublisher(io as never);
  const activity = {
    eventId: 'event-id',
    eventType: 'BidAccepted',
    auctionId: 'auction-id',
    aggregateVersion: 2,
    correlationId: 'correlation-id',
    receivedAt: new Date().toISOString(),
    outcome: 'applied' as const,
  };

  publisher.publish(activity);

  assert.deepEqual(calls, [{ room: adminLiveFeedRoom, event: adminActivityEvent, payload: activity }]);
  assert.notEqual(calls[0]?.payload, activity);
});
