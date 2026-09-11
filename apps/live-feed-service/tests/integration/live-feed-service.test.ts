import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import amqp from 'amqplib';
import type { Channel, ChannelModel } from 'amqplib';
import { io as createSocketClient } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { createClient } from 'redis';
import type { RedisClientType } from 'redis';
import { createLiveFeedService } from '../../src/application/live-feed-service.js';
import type {
  AuctionClosedEnvelope,
  AuctionClosedSocketPayload,
  BidAcceptedEnvelope,
  BidAcceptedSocketPayload,
  WinnerSelectedEnvelope,
  WinnerSelectedSocketPayload,
} from '../../src/domain/events.js';
import type { LiveFeedConfig } from '../../src/config/config.js';
import { integrationEventRoutingKeys } from '../../src/domain/transport.js';

const rabbitMqUrl =
  process.env.RABBITMQ_URL ?? 'amqp://auction:change_me_in_local_env@localhost:5672';
const redisUrl = process.env.LIVE_FEED_TEST_REDIS_URL ?? 'redis://localhost:6379/1';
const exchange = process.env.RABBITMQ_EXCHANGE ?? 'auction.events';

const routingKeys = {
  BidAccepted: integrationEventRoutingKeys.bidAccepted,
  AuctionClosed: integrationEventRoutingKeys.auctionClosed,
  WinnerSelected: integrationEventRoutingKeys.winnerSelected,
} as const;

type TestContext = {
  queue: string;
  dlq: string;
  dlx: string;
  service: ReturnType<typeof createLiveFeedService>;
  rabbitConnection: ChannelModel;
  rabbitChannel: Channel;
  redis: RedisClientType;
};

function bidAccepted(overrides: Partial<BidAcceptedEnvelope> = {}): BidAcceptedEnvelope {
  const auctionId = overrides.aggregateId ?? randomUUID();
  const aggregateVersion = overrides.aggregateVersion ?? 1;

  return {
    eventId: randomUUID(),
    eventType: 'BidAccepted',
    occurredAtUtc: new Date().toISOString(),
    aggregateType: 'Auction',
    aggregateId: auctionId,
    aggregateVersion,
    correlationId: randomUUID(),
    payload: {
      bidId: randomUUID(),
      auctionId,
      bidderId: 'alice',
      amount: 10500,
      auctionVersion: aggregateVersion,
    },
    ...overrides,
    payload: {
      bidId: randomUUID(),
      auctionId,
      bidderId: 'alice',
      amount: 10500,
      auctionVersion: aggregateVersion,
      ...overrides.payload,
    },
  };
}

function auctionClosed(overrides: Partial<AuctionClosedEnvelope> = {}): AuctionClosedEnvelope {
  const auctionId = overrides.aggregateId ?? randomUUID();
  const aggregateVersion = overrides.aggregateVersion ?? 1;

  return {
    eventId: randomUUID(),
    eventType: 'AuctionClosed',
    occurredAtUtc: new Date().toISOString(),
    aggregateType: 'Auction',
    aggregateId: auctionId,
    aggregateVersion,
    correlationId: randomUUID(),
    payload: {
      auctionId,
      closedAtUtc: new Date().toISOString(),
      finalBidAmount: 13000,
      finalBidderId: 'bob',
      auctionVersion: aggregateVersion,
    },
    ...overrides,
    payload: {
      auctionId,
      closedAtUtc: new Date().toISOString(),
      finalBidAmount: 13000,
      finalBidderId: 'bob',
      auctionVersion: aggregateVersion,
      ...overrides.payload,
    },
  };
}

function winnerSelected(overrides: Partial<WinnerSelectedEnvelope> = {}): WinnerSelectedEnvelope {
  const auctionId = overrides.aggregateId ?? randomUUID();
  const aggregateVersion = overrides.aggregateVersion ?? 1;

  return {
    eventId: randomUUID(),
    eventType: 'WinnerSelected',
    occurredAtUtc: new Date().toISOString(),
    aggregateType: 'Auction',
    aggregateId: auctionId,
    aggregateVersion,
    correlationId: randomUUID(),
    payload: {
      auctionId,
      winningBidId: randomUUID(),
      winnerId: 'bob',
      amount: 13000,
      selectedAtUtc: new Date().toISOString(),
      auctionVersion: aggregateVersion,
    },
    ...overrides,
    payload: {
      auctionId,
      winningBidId: randomUUID(),
      winnerId: 'bob',
      amount: 13000,
      selectedAtUtc: new Date().toISOString(),
      auctionVersion: aggregateVersion,
      ...overrides.payload,
    },
  };
}

async function createContext(): Promise<TestContext> {
  const suffix = randomUUID();
  const queue = `live-feed.bid-events.test.${suffix}`;
  const dlq = `${queue}.dlq`;
  const dlx = `${queue}.dead-letter`;
  const rabbitConnection = await amqp.connect(rabbitMqUrl);
  const rabbitChannel = await rabbitConnection.createChannel();

  await rabbitChannel.assertExchange(exchange, 'topic', { durable: true });
  await rabbitChannel.deleteQueue(queue).catch(() => undefined);
  await rabbitChannel.deleteQueue(dlq).catch(() => undefined);
  await rabbitChannel.deleteExchange(dlx).catch(() => undefined);

  const redis = createClient({ url: redisUrl }) as RedisClientType;
  await redis.connect();
  await redis.flushDb();

  const config: Partial<LiveFeedConfig> = {
    port: 0,
    redisUrl,
    rabbitMqUrl,
    rabbitMqExchange: exchange,
    rabbitMqQueue: queue,
    rabbitMqRoutingKey: routingKeys.BidAccepted,
    rabbitMqRoutingKeys: Object.values(routingKeys),
    rabbitMqPrefetch: 3,
    rabbitMqDeadLetterExchange: dlx,
    rabbitMqDeadLetterQueue: dlq,
    idempotencyTtlSeconds: 120,
  };

  const service = createLiveFeedService(config);
  await service.start();

  return { queue, dlq, dlx, service, rabbitConnection, rabbitChannel, redis };
}

async function cleanup(context: TestContext): Promise<void> {
  await context.service.stop().catch(() => undefined);
  await context.rabbitChannel.deleteQueue(context.queue).catch(() => undefined);
  await context.rabbitChannel.deleteQueue(context.dlq).catch(() => undefined);
  await context.rabbitChannel.deleteExchange(context.dlx).catch(() => undefined);
  await context.rabbitChannel.close().catch(() => undefined);
  await context.rabbitConnection.close().catch(() => undefined);
  await context.redis.flushDb().catch(() => undefined);
  await context.redis.quit().catch(() => undefined);
}

function publish(context: TestContext, message: unknown): void {
  const body = Buffer.isBuffer(message) ? message : Buffer.from(JSON.stringify(message), 'utf8');
  const eventType =
    !Buffer.isBuffer(message) && typeof message === 'object' && message && 'eventType' in message
      ? String((message as { eventType: string }).eventType)
      : 'BidAccepted';
  const routingKey = routingKeys[eventType as keyof typeof routingKeys] ?? routingKeys.BidAccepted;

  context.rabbitChannel.publish(exchange, routingKey, body, {
    persistent: true,
    contentType: 'application/json',
  });
}

async function connectClient(context: TestContext, auctionId: string): Promise<Socket> {
  const socket = createSocketClient(context.service.url(), {
    transports: ['websocket'],
    reconnection: false,
  });

  await once<void>(socket, 'connect', 1500);
  await new Promise<void>((resolve, reject) => {
    socket.emit('auction:subscribe', auctionId, (response: { ok: boolean; error?: string }) => {
      if (response.ok) {
        resolve();
      } else {
        reject(new Error(response.error ?? 'Subscription failed.'));
      }
    });
  });

  return socket;
}

function once<T>(socket: Socket, eventName: string, timeoutMs = 1000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(eventName, onEvent);
      reject(new Error(`Timed out waiting for ${eventName}.`));
    }, timeoutMs);

    function onEvent(value: T) {
      clearTimeout(timer);
      resolve(value);
    }

    socket.once(eventName, onEvent);
  });
}

async function expectNoEvent(socket: Socket, eventName: string, timeoutMs = 300): Promise<void> {
  let received = false;
  const listener = () => {
    received = true;
  };

  socket.on(eventName, listener);
  await delay(timeoutMs);
  socket.off(eventName, listener);
  assert.equal(received, false);
}

async function waitFor(assertion: () => Promise<void> | void, timeoutMs = 3000): Promise<void> {
  const started = Date.now();
  let lastError: unknown;

  while (Date.now() - started < timeoutMs) {
    try {
      await assertion();
      return;
    } catch (error) {
      lastError = error;
      await delay(50);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Timed out waiting for assertion.');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

void test('valid BidAccepted event is consumed, ACKed, broadcast, and recorded in Redis', async () => {
  const context = await createContext();
  const accepted = bidAccepted();
  const client = await connectClient(context, accepted.aggregateId);

  try {
    const received = once<BidAcceptedSocketPayload>(client, 'bid:accepted', 1500);
    publish(context, accepted);

    const payload = await received;
    assert.equal(payload.auctionId, accepted.aggregateId);
    assert.equal(payload.bidId, accepted.payload.bidId);
    assert.equal(payload.bidderId, accepted.payload.bidderId);
    assert.equal(payload.amount, accepted.payload.amount);
    assert.equal(payload.auctionVersion, accepted.aggregateVersion);
    assert.equal(payload.correlationId, accepted.correlationId);

    await waitFor(async () => {
      const queueState = await context.rabbitChannel.checkQueue(context.queue);
      assert.equal(queueState.messageCount, 0);
    });

    assert.equal(await context.redis.exists(`live-feed:processed-event:${accepted.eventId}`), 1);
    assert.equal(
      await context.redis.get(`live-feed:auction-version:${accepted.aggregateId}`),
      String(accepted.aggregateVersion),
    );
  } finally {
    client.disconnect();
    await cleanup(context);
  }
});

void test('malformed lifecycle event is dead-lettered and not broadcast', async () => {
  const context = await createContext();
  const client = await connectClient(context, randomUUID());

  try {
    publish(context, { ...auctionClosed(), payload: { auctionId: 'not-a-uuid' } });
    await expectNoEvent(client, 'auction:closed');

    await waitFor(async () => {
      const dlqState = await context.rabbitChannel.checkQueue(context.dlq);
      assert.equal(dlqState.messageCount, 1);
    });
  } finally {
    client.disconnect();
    await cleanup(context);
  }
});

void test('AuctionClosed and WinnerSelected events broadcast to the correct auction room', async () => {
  const context = await createContext();
  const auctionId = randomUUID();
  const otherAuctionId = randomUUID();
  const client = await connectClient(context, auctionId);
  const otherClient = await connectClient(context, otherAuctionId);
  const closed = auctionClosed({ aggregateId: auctionId, aggregateVersion: 16 });
  const winner = winnerSelected({
    aggregateId: auctionId,
    aggregateVersion: 16,
    correlationId: closed.correlationId,
  });

  try {
    const closedReceived = once<AuctionClosedSocketPayload>(client, 'auction:closed', 1500);
    publish(context, closed);
    assert.equal((await closedReceived).auctionVersion, 16);
    await expectNoEvent(otherClient, 'auction:closed');

    const winnerReceived = once<WinnerSelectedSocketPayload>(client, 'winner:selected', 1500);
    publish(context, winner);
    const winnerPayload = await winnerReceived;
    assert.equal(winnerPayload.auctionId, auctionId);
    assert.equal(winnerPayload.winningBidId, winner.payload.winningBidId);
    assert.equal(winnerPayload.winnerId, 'bob');
    assert.equal(winnerPayload.auctionVersion, 16);
    await expectNoEvent(otherClient, 'winner:selected');
  } finally {
    client.disconnect();
    otherClient.disconnect();
    await cleanup(context);
  }
});

void test('duplicate lifecycle eventId is ACKed but not broadcast twice', async () => {
  const context = await createContext();
  const closed = auctionClosed({ aggregateVersion: 5 });
  const winner = winnerSelected({ aggregateId: closed.aggregateId, aggregateVersion: 5 });
  const client = await connectClient(context, closed.aggregateId);
  const closedSeen: AuctionClosedSocketPayload[] = [];
  const winnerSeen: WinnerSelectedSocketPayload[] = [];
  client.on('auction:closed', (payload: AuctionClosedSocketPayload) => closedSeen.push(payload));
  client.on('winner:selected', (payload: WinnerSelectedSocketPayload) => winnerSeen.push(payload));

  try {
    publish(context, closed);
    await waitFor(() => assert.equal(closedSeen.length, 1));
    publish(context, closed);
    await delay(400);
    assert.equal(closedSeen.length, 1);

    publish(context, winner);
    await waitFor(() => assert.equal(winnerSeen.length, 1));
    publish(context, winner);
    await delay(400);
    assert.equal(winnerSeen.length, 1);
  } finally {
    client.disconnect();
    await cleanup(context);
  }
});

void test('same-version sibling lifecycle events are both accepted in either order', async () => {
  const context = await createContext();
  const auctionId = randomUUID();
  const client = await connectClient(context, auctionId);
  const seen: string[] = [];
  client.on('auction:closed', () => seen.push('closed'));
  client.on('winner:selected', () => seen.push('winner'));

  try {
    publish(context, auctionClosed({ aggregateId: auctionId, aggregateVersion: 16 }));
    await waitFor(() => assert.deepEqual(seen, ['closed']));
    publish(context, winnerSelected({ aggregateId: auctionId, aggregateVersion: 16 }));
    await waitFor(() => assert.deepEqual(seen, ['closed', 'winner']));
    assert.equal(await context.redis.get(`live-feed:auction-version:${auctionId}`), '16');
  } finally {
    client.disconnect();
    await cleanup(context);
  }

  const reverse = await createContext();
  const reverseAuctionId = randomUUID();
  const reverseClient = await connectClient(reverse, reverseAuctionId);
  const reverseSeen: string[] = [];
  reverseClient.on('auction:closed', () => reverseSeen.push('closed'));
  reverseClient.on('winner:selected', () => reverseSeen.push('winner'));

  try {
    publish(reverse, winnerSelected({ aggregateId: reverseAuctionId, aggregateVersion: 16 }));
    await waitFor(() => assert.deepEqual(reverseSeen, ['winner']));
    publish(reverse, auctionClosed({ aggregateId: reverseAuctionId, aggregateVersion: 16 }));
    await waitFor(() => assert.deepEqual(reverseSeen, ['winner', 'closed']));
    assert.equal(await reverse.redis.get(`live-feed:auction-version:${reverseAuctionId}`), '16');
  } finally {
    reverseClient.disconnect();
    await cleanup(reverse);
  }
});

void test('aggregateVersion lower events are stale, same-version new events are accepted, and higher versions advance', async () => {
  const context = await createContext();
  const auctionId = randomUUID();
  const client = await connectClient(context, auctionId);
  const seen: Array<{ event: string; version: number }> = [];
  client.on('auction:closed', (payload: AuctionClosedSocketPayload) =>
    seen.push({ event: 'closed', version: payload.auctionVersion }),
  );
  client.on('winner:selected', (payload: WinnerSelectedSocketPayload) =>
    seen.push({ event: 'winner', version: payload.auctionVersion }),
  );

  try {
    publish(context, auctionClosed({ aggregateId: auctionId, aggregateVersion: 16 }));
    await waitFor(() => assert.equal(seen.length, 1));

    publish(context, winnerSelected({ aggregateId: auctionId, aggregateVersion: 15 }));
    await delay(400);
    assert.equal(seen.length, 1);
    assert.equal(await context.redis.get(`live-feed:auction-version:${auctionId}`), '16');

    publish(context, winnerSelected({ aggregateId: auctionId, aggregateVersion: 16 }));
    await waitFor(() => assert.equal(seen.length, 2));
    assert.equal(seen[1].version, 16);
    assert.equal(await context.redis.get(`live-feed:auction-version:${auctionId}`), '16');

    publish(context, auctionClosed({ aggregateId: auctionId, aggregateVersion: 17 }));
    await waitFor(() => assert.equal(seen.length, 3));
    assert.equal(seen[2].version, 17);
    assert.equal(await context.redis.get(`live-feed:auction-version:${auctionId}`), '17');
  } finally {
    client.disconnect();
    await cleanup(context);
  }
});

void test('duplicate eventId is ignored regardless of version', async () => {
  const context = await createContext();
  const auctionId = randomUUID();
  const eventId = randomUUID();
  const client = await connectClient(context, auctionId);
  const seen: AuctionClosedSocketPayload[] = [];
  client.on('auction:closed', (payload: AuctionClosedSocketPayload) => seen.push(payload));

  try {
    publish(context, auctionClosed({ eventId, aggregateId: auctionId, aggregateVersion: 16 }));
    await waitFor(() => assert.equal(seen.length, 1));
    publish(
      context,
      auctionClosed({
        eventId,
        aggregateId: auctionId,
        aggregateVersion: 17,
        payload: { auctionVersion: 17 },
      }),
    );
    await delay(400);

    assert.equal(seen.length, 1);
    assert.equal(await context.redis.get(`live-feed:auction-version:${auctionId}`), '16');
  } finally {
    client.disconnect();
    await cleanup(context);
  }
});

void test('runtime diagnostics are read-only and expose expected sections', async () => {
  const context = await createContext();

  try {
    const response = await fetch(`${context.service.url()}/diagnostics/runtime`, {
      headers: { 'x-correlation-id': 'http-correlation-a' },
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      service: string;
      runtime: { nodeVersion: string; uptimeSeconds: number };
      memory: Record<string, number>;
      eventLoop: { utilization: number; delayMs: Record<string, number> };
      requestContext: { correlationId?: string; requestId?: string };
    };

    assert.equal(body.service, 'live-feed-service');
    assert.equal(typeof body.runtime.nodeVersion, 'string');
    assert.ok(body.runtime.uptimeSeconds >= 0);
    assert.ok(body.memory.heapUsed >= 0);
    assert.ok(body.eventLoop.utilization >= 0);
    assert.ok(body.eventLoop.delayMs.p95 >= 0);
    assert.equal(body.requestContext.correlationId, 'http-correlation-a');

    const secondResponse = await fetch(`${context.service.url()}/diagnostics/runtime`, {
      headers: { 'x-correlation-id': 'http-correlation-b' },
    });
    const secondBody = (await secondResponse.json()) as {
      requestContext: { correlationId?: string };
    };
    assert.equal(secondBody.requestContext.correlationId, 'http-correlation-b');
    assert.equal('env' in body, false);
  } finally {
    await cleanup(context);
  }
});
