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
import type { LiveFeedConfig } from '../config/config.js';
import { loadConfig } from '../config/config.js';
import { LiveFeedEventProcessor } from './processors/live-feed-event-processor.js';
import { LiveFeedRabbitMqConsumer } from '../infrastructure/messaging/rabbitmq-consumer.js';
import { auctionRoom, parseAuctionSubscription } from '../transport/websocket/rooms.js';
import { LiveFeedStateStore } from '../infrastructure/cache/redis-state.js';
import { SocketIoLiveFeedPublisher } from '../transport/websocket/socketio-live-feed-publisher.js';
import { EventLoopMonitor } from '../infrastructure/runtime/event-loop-monitor.js';
import { getProcessMetrics } from '../infrastructure/runtime/process-metrics.js';
import { getContext, runWithContext } from '../infrastructure/runtime/async-context.js';
import { createShutdownCoordinator } from '../infrastructure/runtime/shutdown-coordinator.js';
import { runWithStartupCleanup } from '../infrastructure/runtime/startup.js';
import { createHttpErrorHandler } from '../transport/http/error-handler.js';
import { registerLiveFeedStreamRoute } from '../transport/http/live-feed-stream-route.js';
import { createLiveFeedStreamRecords } from './streams/create-live-feed-stream.js';
import { WorkerActivityCalculator } from '../infrastructure/workers/worker-activity-calculator.js';
import { registerLiveFeedActivityRoute } from '../transport/http/live-feed-activity-route.js';
import { registerRuntimeThreadPoolRoute } from '../transport/http/runtime-thread-pool-route.js';
import { registerRuntimeChildProcessRoute } from '../transport/http/runtime-child-process-route.js';

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
  const publisher = new SocketIoLiveFeedPublisher(io);
  const processor = new LiveFeedEventProcessor(publisher, stateStore);
  const consumer = new LiveFeedRabbitMqConsumer(config, processor);
  const eventLoopMonitor = new EventLoopMonitor();
  const activityCalculator = new WorkerActivityCalculator();

  app.use((request, _response, next) => {
    const requestId = request.get('x-request-id') ?? undefined;
    const correlationId = request.get('x-correlation-id') ?? requestId;
    runWithContext({ requestId, correlationId }, next);
  });

  app.get('/diagnostics/runtime', (_request, response) => {
    const processMetrics = getProcessMetrics();
    response.json({
      service: 'live-feed-service',
      runtime: {
        nodeVersion: processMetrics.nodeVersion,
        uptimeSeconds: processMetrics.uptimeSeconds,
      },
      memory: processMetrics.memory,
      eventLoop: eventLoopMonitor.snapshot(),
      requestContext: getContext(),
    });
  });

  app.get('/health', (_request, response) => {
    response.json({
      status: redis.isOpen && redisPub.isOpen && redisSub.isOpen ? 'ok' : 'degraded',
      service: 'live-feed-service',
      rabbitMqConnected: consumer.connected,
      redisConnected: redis.isOpen && redisPub.isOpen && redisSub.isOpen,
      checkedAtUtc: new Date().toISOString(),
    });
  });

  registerLiveFeedStreamRoute(app, () => {
    const processMetrics = getProcessMetrics();
    return createLiveFeedStreamRecords({
      nodeVersion: processMetrics.nodeVersion,
      uptimeSeconds: processMetrics.uptimeSeconds,
      memory: processMetrics.memory,
      eventLoop: eventLoopMonitor.snapshot(),
    });
  });
  registerLiveFeedActivityRoute(app, activityCalculator, () => {
    const processMetrics = getProcessMetrics();
    const eventLoop = eventLoopMonitor.snapshot();
    return {
      samples: [...Object.values(processMetrics.memory), eventLoop.utilization, ...Object.values(eventLoop.delayMs)],
    };
  });
  registerRuntimeThreadPoolRoute(app);
  registerRuntimeChildProcessRoute(app);

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

  app.use(createHttpErrorHandler());

  const shutdown = createShutdownCoordinator([
    { name: 'RabbitMQ consumer', run: () => consumer.stop() },
    { name: 'Socket.IO and HTTP server', run: () => closeSocketServer(io) },
    {
      name: 'Redis clients',
      run: async () => {
        await Promise.all([
          redis.quit().catch(() => undefined),
          redisPub.quit().catch(() => undefined),
          redisSub.quit().catch(() => undefined),
        ]);
      },
    },
    { name: 'event-loop monitor', run: () => eventLoopMonitor.stop() },
    { name: 'activity workers', run: () => activityCalculator.close() },
  ]);

  return {
    async start() {
      await runWithStartupCleanup(async () => {
        eventLoopMonitor.start();
        await Promise.all([redis.connect(), redisPub.connect(), redisSub.connect()]);
        io.adapter(createAdapter(redisPub, redisSub));
        await new Promise<void>((resolve, reject) => {
          httpServer.once('error', reject);
          httpServer.listen(config.port, resolve);
        });
        await consumer.start();
        console.log(`Live Feed Service listening on ${this.url()}`);
      }, shutdown);
    },
    async stop() {
      await shutdown();
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

async function closeSocketServer(io: Server): Promise<void> {
  await new Promise<void>((resolve) => {
    void io.close(() => resolve());
  });
}
