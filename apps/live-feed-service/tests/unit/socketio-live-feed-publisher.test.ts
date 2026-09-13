/**
 * Tests for the Socket.IO live-feed publisher adapter.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { SocketIoLiveFeedPublisher } from '../../src/transport/websocket/socketio-live-feed-publisher.js';

void test('publisher preserves the existing room, event name, and payload', () => {
  const calls: Array<{ room: string; eventName: string; payload: unknown }> = [];
  const io = {
    to: (room: string) => ({
      emit: (eventName: string, payload: unknown) => calls.push({ room, eventName, payload }),
    }),
  };
  const publisher = new SocketIoLiveFeedPublisher(io as never);
  const payload = { auctionId: 'auction-id', amount: 100 };

  publisher.publish({
    tenantId: 'aaaaaaaa-1111-4111-8111-111111111111',
    auctionId: 'auction-id',
    eventName: 'bid:accepted',
    payload: payload as never,
  });

  assert.deepEqual(calls, [
    {
      room: 'tenant:aaaaaaaa-1111-4111-8111-111111111111:auction:auction-id',
      eventName: 'bid:accepted',
      payload,
    },
  ]);
});
