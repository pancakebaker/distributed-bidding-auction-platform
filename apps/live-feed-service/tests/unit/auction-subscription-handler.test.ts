import assert from 'node:assert/strict';
import test from 'node:test';
import { LiveFeedSubscriptionAuthorizer } from '../../src/application/live-feed-subscription-authorizer.js';
import { registerAuctionSubscriptionHandlers } from '../../src/transport/websocket/auction-subscription-handler.js';

type Handler = (
  value: unknown,
  acknowledge?: (response: Record<string, unknown>) => void,
) => Promise<void>;

function createSocket() {
  const handlers = new Map<string, Handler>();
  const joined: string[] = [];
  const left: string[] = [];
  const socket = {
    on(event: string, handler: Handler) {
      handlers.set(event, handler);
    },
    join(room: string) {
      joined.push(room);
      return Promise.resolve();
    },
    leave(room: string) {
      left.push(room);
    },
  };
  return { handlers, joined, left, socket };
}

function createAuthorizer(
  decisions: Array<
    'allowed' | 'denied' | 'not_found' | 'unavailable' | 'unauthorized_internal_service'
  >,
  requested: string[],
) {
  let index = 0;
  return new LiveFeedSubscriptionAuthorizer({
    canExposeAuctionLiveFeed: (auctionId) => {
      requested.push(auctionId);
      return Promise.resolve({ kind: decisions[index++] ?? ('unavailable' as const) });
    },
  });
}

const auctionId = '11111111-1111-1111-1111-111111111111';
const tenantId = 'aaaaaaaa-1111-4111-8111-111111111111';
const projection = {
  getProjection: () => Promise.resolve({ tenantId, auctionId, aggregateVersion: 1 }),
};

void test('allowed subscriptions authorize before joining and acknowledge success', async () => {
  const requested: string[] = [];
  const { handlers, joined, socket } = createSocket();
  registerAuctionSubscriptionHandlers(
    socket as never,
    projection,
    createAuthorizer(['allowed'], requested),
  );

  let response: Record<string, unknown> | undefined;
  await handlers.get('auction:subscribe')?.({ auctionId, tenantId }, (value) => {
    response = value;
  });

  assert.deepEqual(requested, [auctionId]);
  assert.deepEqual(joined, [`tenant:${tenantId}:auction:${auctionId}`]);
  assert.deepEqual(response, {
    ok: true,
    room: `tenant:${tenantId}:auction:${auctionId}`,
  });
});

void test('denied, missing, and unavailable decisions never join the room', async () => {
  const requested: string[] = [];
  const { handlers, joined, socket } = createSocket();
  registerAuctionSubscriptionHandlers(
    socket as never,
    projection,
    createAuthorizer(['denied', 'not_found', 'unavailable'], requested),
  );
  const responses: Record<string, unknown>[] = [];
  const subscribe = handlers.get('auction:subscribe');

  await subscribe?.({ auctionId, tenantId }, (value) => responses.push(value));
  await subscribe?.({ auctionId, tenantId }, (value) => responses.push(value));
  await subscribe?.({ auctionId, tenantId }, (value) => responses.push(value));

  assert.deepEqual(requested, [auctionId, auctionId, auctionId]);
  assert.deepEqual(joined, []);
  assert.deepEqual(responses, [
    { ok: false, error: 'subscription_denied' },
    { ok: false, error: 'auction_not_found' },
    { ok: false, error: 'live_feed_unavailable' },
  ]);
});

void test('invalid payloads are rejected before the trusted decision boundary', async () => {
  const requested: string[] = [];
  const { handlers, joined, socket } = createSocket();
  registerAuctionSubscriptionHandlers(
    socket as never,
    projection,
    createAuthorizer(['allowed'], requested),
  );

  let response: Record<string, unknown> | undefined;
  await handlers.get('auction:subscribe')?.({ auctionId: 'not-a-uuid' }, (value) => {
    response = value;
  });

  assert.deepEqual(requested, []);
  assert.deepEqual(joined, []);
  assert.deepEqual(response, { ok: false, error: 'invalid_auction_id' });
});

void test('each subscription rechecks access and unsubscribe does not authorize', async () => {
  const requested: string[] = [];
  const { handlers, joined, left, socket } = createSocket();
  registerAuctionSubscriptionHandlers(
    socket as never,
    projection,
    createAuthorizer(['allowed', 'denied'], requested),
  );
  const subscribe = handlers.get('auction:subscribe');
  const responses: Record<string, unknown>[] = [];

  await subscribe?.({ auctionId, tenantId }, (value) => responses.push(value));
  await subscribe?.({ auctionId, tenantId }, (value) => responses.push(value));
  await handlers.get('auction:unsubscribe')?.({ auctionId, tenantId }, (value) =>
    responses.push(value),
  );

  assert.deepEqual(requested, [auctionId, auctionId]);
  assert.deepEqual(joined, [`tenant:${tenantId}:auction:${auctionId}`]);
  assert.deepEqual(left, [`tenant:${tenantId}:auction:${auctionId}`]);
  assert.deepEqual(responses, [
    { ok: true, room: `tenant:${tenantId}:auction:${auctionId}` },
    { ok: false, error: 'subscription_denied' },
    { ok: true, room: `tenant:${tenantId}:auction:${auctionId}` },
  ]);
});
