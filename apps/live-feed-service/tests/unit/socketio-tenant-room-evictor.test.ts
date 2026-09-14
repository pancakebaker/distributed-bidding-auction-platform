import assert from 'node:assert/strict';
import test from 'node:test';
import { SocketIoTenantRoomEvictor } from '../../src/transport/websocket/socketio-tenant-room-evictor.js';

void test('evicts only public auction rooms for the disabled tenant', async () => {
  const calls: Array<{ room: string; operation: string }> = [];
  const rooms = new Map([
    ['tenant:aaaaaaaa-1111-4111-8111-111111111111:auction:one', new Set()],
    ['tenant:aaaaaaaa-1111-4111-8111-111111111111:auction:two', new Set()],
    ['tenant:bbbbbbbb-1111-4111-8111-111111111111:auction:three', new Set()],
    ['admin:live-feed', new Set()],
  ]);
  const io = {
    of: () => ({ adapter: { rooms } }),
    on: () => io,
    in: (room: string) => ({
      emit: () => calls.push({ room, operation: 'emit' }),
      socketsLeave: () => calls.push({ room, operation: 'leave' }),
    }),
  };

  await new SocketIoTenantRoomEvictor(io as never).evictTenantRooms(
    'aaaaaaaa-1111-4111-8111-111111111111',
  );

  assert.deepEqual(calls, [
    {
      room: 'tenant:aaaaaaaa-1111-4111-8111-111111111111:auction:one',
      operation: 'emit',
    },
    {
      room: 'tenant:aaaaaaaa-1111-4111-8111-111111111111:auction:one',
      operation: 'leave',
    },
    {
      room: 'tenant:aaaaaaaa-1111-4111-8111-111111111111:auction:two',
      operation: 'emit',
    },
    {
      room: 'tenant:aaaaaaaa-1111-4111-8111-111111111111:auction:two',
      operation: 'leave',
    },
  ]);
});
