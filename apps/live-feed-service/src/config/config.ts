/**
 * Environment-backed configuration for the live-feed service runtime and integration dependencies.
 */
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Runtime settings for HTTP, Redis, RabbitMQ, PostgreSQL history, and live-feed idempotency behavior.
 */
export type LiveFeedConfig = {
  port: number;
  clientOrigin: string;
  redisUrl: string;
  rabbitMqUrl: string;
  rabbitMqExchange: string;
  rabbitMqQueue: string;
  rabbitMqRoutingKey: string;
  rabbitMqRoutingKeys: string[];
  rabbitMqPrefetch: number;
  rabbitMqDeadLetterExchange: string;
  rabbitMqDeadLetterQueue: string;
  idempotencyTtlSeconds: number;
  liveFeedDatabaseUrl?: string;
  liveFeedDbPoolMax: number;
  liveFeedDbIdleTimeoutMs: number;
  liveFeedDbConnectionTimeoutMs: number;
  adminTokenPublicKeyPath: string;
  adminTokenIssuer: string;
  adminTokenAudience: string;
};

function numberFromEnv(name: string, fallback: number): number {
  const value = process.env[name];

  if (!value) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative number.`);
  }

  return parsed;
}

function routingKeysFromEnv(): string[] {
  const raw = process.env.LIVE_FEED_RABBITMQ_ROUTING_KEYS ?? process.env.LIVE_FEED_RABBITMQ_ROUTING_KEY;
  if (!raw) {
    return ['auction.bid.accepted', 'auction.closed', 'auction.winner.selected'];
  }

  return raw
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean);
}

function rabbitMqUrlFromEnv(): string {
  if (process.env.RABBITMQ_URL) {
    return process.env.RABBITMQ_URL;
  }

  const host = process.env.RABBITMQ_HOST ?? 'localhost';
  const port = process.env.RABBITMQ_AMQP_PORT ?? '5672';
  const username = encodeURIComponent(process.env.RABBITMQ_USERNAME ?? process.env.RABBITMQ_DEFAULT_USER ?? 'auction');
  const password = encodeURIComponent(
    process.env.RABBITMQ_PASSWORD ?? process.env.RABBITMQ_DEFAULT_PASS ?? 'change_me_in_local_env',
  );
  const virtualHost = process.env.RABBITMQ_VHOST ? `/${encodeURIComponent(process.env.RABBITMQ_VHOST)}` : '';

  return `amqp://${username}:${password}@${host}:${port}${virtualHost}`;
}

/**
 * Loads live-feed configuration from environment variables with optional test overrides.
 */
export function loadConfig(overrides: Partial<LiveFeedConfig> = {}): LiveFeedConfig {
  const serviceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const configuredPublicKeyPath = process.env.LIVE_FEED_ADMIN_TOKEN_PUBLIC_KEY_PATH;

  return {
    port: numberFromEnv('PORT', 3001),
    clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:8000',
    redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
    rabbitMqUrl: rabbitMqUrlFromEnv(),
    rabbitMqExchange: process.env.RABBITMQ_EXCHANGE ?? 'auction.events',
    rabbitMqQueue: process.env.LIVE_FEED_RABBITMQ_QUEUE ?? 'live-feed.bid-events',
    rabbitMqRoutingKey: process.env.LIVE_FEED_RABBITMQ_ROUTING_KEY ?? 'auction.bid.accepted',
    rabbitMqRoutingKeys: routingKeysFromEnv(),
    rabbitMqPrefetch: numberFromEnv('LIVE_FEED_RABBITMQ_PREFETCH', 10),
    rabbitMqDeadLetterExchange: process.env.LIVE_FEED_RABBITMQ_DLX ?? 'live-feed.dead-letter',
    rabbitMqDeadLetterQueue: process.env.LIVE_FEED_RABBITMQ_DLQ ?? 'live-feed.bid-events.dlq',
    idempotencyTtlSeconds: numberFromEnv('LIVE_FEED_IDEMPOTENCY_TTL_SECONDS', 86400),
    liveFeedDatabaseUrl: process.env.LIVE_FEED_DATABASE_URL,
    liveFeedDbPoolMax: numberFromEnv('LIVE_FEED_DB_POOL_MAX', 5),
    liveFeedDbIdleTimeoutMs: numberFromEnv('LIVE_FEED_DB_IDLE_TIMEOUT_MS', 10000),
    liveFeedDbConnectionTimeoutMs: numberFromEnv('LIVE_FEED_DB_CONNECTION_TIMEOUT_MS', 2000),
    adminTokenPublicKeyPath: configuredPublicKeyPath
      ? isAbsolute(configuredPublicKeyPath)
        ? configuredPublicKeyPath
        : resolve(serviceRoot, configuredPublicKeyPath)
      : resolve(serviceRoot, 'config/live-feed-admin-public.pem'),
    adminTokenIssuer: process.env.LIVE_FEED_ADMIN_TOKEN_ISSUER ?? 'auction-client',
    adminTokenAudience: process.env.LIVE_FEED_ADMIN_TOKEN_AUDIENCE ?? 'live-feed-admin',
    ...overrides,
  };
}
