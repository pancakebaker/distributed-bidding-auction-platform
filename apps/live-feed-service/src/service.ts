/**
 * Express, Socket.IO, Redis, and RabbitMQ composition root for the live-feed service.
 */
import express from 'express';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import type { RedisClientType } from 'redis';
import type { LiveFeedConfig } from './config.js';
import { loadConfig } from './config.js';
import { LiveFeedEventProcessor } from './processor.js';
import { LiveFeedRabbitMqConsumer } from './rabbitMqConsumer.js';
import { auctionRoom, parseAuctionSubscription } from './rooms.js';
import { LiveFeedStateStore } from './redisState.js';

/**
 * Runtime handle returned by the live-feed composition root for startup, shutdown, and tests.
 */
export type LiveFeedService = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  port: () => number;
  url: () => string;
  io: Server;
  redis: RedisClientType;
  consumer: LiveFeedRabbitMqConsumer;
};

/**
 * Creates the live-feed HTTP server, Socket.IO server, Redis adapter, state store, and RabbitMQ consumer.
 */
export function createLiveFeedService(overrides: Partial<LiveFeedConfig> = {}): LiveFeedService {
  const config = loadConfig(overrides);
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: config.clientOrigin,
    },
  });

  const redis = createClient({
    url: config.redisUrl,
    socket: {
      reconnectStrategy: (retries) => Math.min(retries * 100, 2000),
    },
  }) as RedisClientType;

  const redisPub = redis.duplicate() as RedisClientType;
  const redisSub = redis.duplicate() as RedisClientType;
  const stateStore = new LiveFeedStateStore(redis, config.idempotencyTtlSeconds);
  const processor = new LiveFeedEventProcessor(io, stateStore);
  const consumer = new LiveFeedRabbitMqConsumer(config, processor);

  app.get('/health', (_request, response) => {
    response.json({
      status: redis.isOpen && redisPub.isOpen && redisSub.isOpen ? 'ok' : 'degraded',
      service: 'live-feed-service',
      rabbitMqConnected: consumer.connected,
      redisConnected: redis.isOpen && redisPub.isOpen && redisSub.isOpen,
      checkedAtUtc: new Date().toISOString(),
    });
  });

  io.on('connection', (socket) => {
    socket.emit('status', {
      service: 'live-feed-service',
      message: 'connected',
    });

    socket.on(
      'auction:subscribe',
      (value, acknowledge?: (response: { ok: boolean; room?: string; error?: string }) => void) => {
        const auctionId = parseAuctionSubscription(value);

        if (!auctionId) {
          acknowledge?.({ ok: false, error: 'invalid_auction_id' });
          socket.emit('subscription:error', { code: 'invalid_auction_id' });
          return;
        }

        const room = auctionRoom(auctionId);
        void socket.join(room);
        acknowledge?.({ ok: true, room });
      },
    );

    socket.on(
      'auction:unsubscribe',
      (value, acknowledge?: (response: { ok: boolean; room?: string; error?: string }) => void) => {
        const auctionId = parseAuctionSubscription(value);

        if (!auctionId) {
          acknowledge?.({ ok: false, error: 'invalid_auction_id' });
          return;
        }

        const room = auctionRoom(auctionId);
        void socket.leave(room);
        acknowledge?.({ ok: true, room });
      },
    );
  });

  return {
    async start() {
      await Promise.all([redis.connect(), redisPub.connect(), redisSub.connect()]);
      io.adapter(createAdapter(redisPub, redisSub));
      await new Promise<void>((resolve) => {
        httpServer.listen(config.port, resolve);
      });
      await consumer.start();
      console.log(`Live Feed Service listening on ${this.url()}`);
    },
    async stop() {
      await consumer.stop();
      await new Promise<void>((resolve) => {
        void io.close(() => resolve());
      });
      await Promise.all([
        redis.quit().catch(() => undefined),
        redisPub.quit().catch(() => undefined),
        redisSub.quit().catch(() => undefined),
      ]);
    },
    port() {
      const address = httpServer.address() as AddressInfo | null;
      return address?.port ?? config.port;
    },
    url() {
      return `http://localhost:${this.port()}`;
    },
    io,
    redis,
    consumer,
  };
}
