import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import amqp from "amqplib";
import type { Channel, ChannelModel } from "amqplib";
import { io as createSocketClient } from "socket.io-client";
import type { Socket } from "socket.io-client";
import { createClient } from "redis";
import type { RedisClientType } from "redis";
import { createLiveFeedService } from "./service.js";
import type { BidAcceptedEnvelope, BidAcceptedSocketPayload } from "./events.js";
import type { LiveFeedConfig } from "./config.js";

const rabbitMqUrl = process.env.RABBITMQ_URL ?? "amqp://auction:change_me_in_local_env@localhost:5672";
const redisUrl = process.env.LIVE_FEED_TEST_REDIS_URL ?? "redis://localhost:6379/1";
const exchange = process.env.RABBITMQ_EXCHANGE ?? "auction.events";
const routingKey = "auction.bid.accepted";

type TestContext = {
  queue: string;
  dlq: string;
  dlx: string;
  service: ReturnType<typeof createLiveFeedService>;
  rabbitConnection: ChannelModel;
  rabbitChannel: Channel;
  redis: RedisClientType;
};

function envelope(overrides: Partial<BidAcceptedEnvelope> = {}): BidAcceptedEnvelope {
  const auctionId = overrides.aggregateId ?? randomUUID();
  const aggregateVersion = overrides.aggregateVersion ?? 1;

  return {
    eventId: randomUUID(),
    eventType: "BidAccepted",
    occurredAtUtc: new Date().toISOString(),
    aggregateType: "Auction",
    aggregateId: auctionId,
    aggregateVersion,
    correlationId: randomUUID(),
    payload: {
      bidId: randomUUID(),
      auctionId,
      bidderId: "alice",
      amount: 10500,
      auctionVersion: aggregateVersion
    },
    ...overrides,
    payload: {
      bidId: randomUUID(),
      auctionId,
      bidderId: "alice",
      amount: 10500,
      auctionVersion: aggregateVersion,
      ...overrides.payload
    }
  };
}

async function createContext(): Promise<TestContext> {
  const suffix = randomUUID();
  const queue = `live-feed.bid-events.test.${suffix}`;
  const dlq = `${queue}.dlq`;
  const dlx = `${queue}.dead-letter`;
  const rabbitConnection = await amqp.connect(rabbitMqUrl);
  const rabbitChannel = await rabbitConnection.createChannel();

  await rabbitChannel.assertExchange(exchange, "topic", { durable: true });
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
    rabbitMqRoutingKey: routingKey,
    rabbitMqPrefetch: 3,
    rabbitMqDeadLetterExchange: dlx,
    rabbitMqDeadLetterQueue: dlq,
    idempotencyTtlSeconds: 120
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
  const body = Buffer.isBuffer(message) ? message : Buffer.from(JSON.stringify(message), "utf8");
  context.rabbitChannel.publish(exchange, routingKey, body, {
    persistent: true,
    contentType: "application/json"
  });
}

async function connectClient(context: TestContext, auctionId: string): Promise<Socket> {
  const socket = createSocketClient(context.service.url(), {
    transports: ["websocket"],
    reconnection: false
  });

  await once<void>(socket, "connect", 1500);
  await new Promise<void>((resolve, reject) => {
    socket.emit("auction:subscribe", auctionId, (response: { ok: boolean; error?: string }) => {
      if (response.ok) {
        resolve();
      } else {
        reject(new Error(response.error ?? "Subscription failed."));
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

async function expectNoBid(socket: Socket, timeoutMs = 300): Promise<void> {
  let received = false;
  const listener = () => {
    received = true;
  };

  socket.on("bid:accepted", listener);
  await delay(timeoutMs);
  socket.off("bid:accepted", listener);
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

  throw lastError instanceof Error ? lastError : new Error("Timed out waiting for assertion.");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("valid BidAccepted event is consumed, ACKed, broadcast, and recorded in Redis", async () => {
  const context = await createContext();
  const accepted = envelope();
  const client = await connectClient(context, accepted.aggregateId);

  try {
    const received = once<BidAcceptedSocketPayload>(client, "bid:accepted", 1500);
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
    assert.equal(await context.redis.get(`live-feed:auction-version:${accepted.aggregateId}`), String(accepted.aggregateVersion));
  } finally {
    client.disconnect();
    await cleanup(context);
  }
});

test("malformed event is dead-lettered and not broadcast", async () => {
  const context = await createContext();
  const client = await connectClient(context, randomUUID());

  try {
    publish(context, Buffer.from("{not-json", "utf8"));
    await expectNoBid(client);

    await waitFor(async () => {
      const dlqState = await context.rabbitChannel.checkQueue(context.dlq);
      assert.equal(dlqState.messageCount, 1);
    });
  } finally {
    client.disconnect();
    await cleanup(context);
  }
});

test("duplicate eventId is ACKed but not broadcast twice", async () => {
  const context = await createContext();
  const accepted = envelope();
  const client = await connectClient(context, accepted.aggregateId);
  const seen: BidAcceptedSocketPayload[] = [];
  client.on("bid:accepted", (payload) => seen.push(payload));

  try {
    publish(context, accepted);
    await waitFor(() => assert.equal(seen.length, 1));
    publish(context, accepted);
    await delay(500);

    assert.equal(seen.length, 1);
    assert.equal(await context.redis.exists(`live-feed:processed-event:${accepted.eventId}`), 1);
  } finally {
    client.disconnect();
    await cleanup(context);
  }
});

test("aggregateVersion advances, stale versions are ignored, and version gaps are accepted", async () => {
  const context = await createContext();
  const auctionId = randomUUID();
  const client = await connectClient(context, auctionId);
  const seen: BidAcceptedSocketPayload[] = [];
  client.on("bid:accepted", (payload) => seen.push(payload));

  try {
    publish(context, envelope({ aggregateId: auctionId, aggregateVersion: 42 }));
    await waitFor(() => assert.equal(seen.length, 1));
    assert.equal(seen[0].auctionVersion, 42);
    assert.equal(await context.redis.get(`live-feed:auction-version:${auctionId}`), "42");

    publish(context, envelope({ aggregateId: auctionId, aggregateVersion: 42 }));
    publish(context, envelope({ aggregateId: auctionId, aggregateVersion: 41 }));
    await delay(500);

    assert.equal(seen.length, 1);
    assert.equal(await context.redis.get(`live-feed:auction-version:${auctionId}`), "42");

    publish(context, envelope({ aggregateId: auctionId, aggregateVersion: 44 }));
    await waitFor(() => assert.equal(seen.length, 2));
    assert.equal(seen[1].auctionVersion, 44);
    assert.equal(await context.redis.get(`live-feed:auction-version:${auctionId}`), "44");
  } finally {
    client.disconnect();
    await cleanup(context);
  }
});

test("events are emitted only to the subscribed auction room", async () => {
  const context = await createContext();
  const auctionId = randomUUID();
  const otherAuctionId = randomUUID();
  const client = await connectClient(context, auctionId);
  const otherClient = await connectClient(context, otherAuctionId);
  const accepted = envelope({ aggregateId: auctionId, aggregateVersion: 1 });

  try {
    const received = once<BidAcceptedSocketPayload>(client, "bid:accepted", 1500);
    publish(context, accepted);

    assert.equal((await received).auctionId, auctionId);
    await expectNoBid(otherClient);
  } finally {
    client.disconnect();
    otherClient.disconnect();
    await cleanup(context);
  }
});
