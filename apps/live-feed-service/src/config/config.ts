/**
 * Environment-backed configuration for the live-feed service runtime and integration dependencies.
 */
import { dirname, isAbsolute, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { integrationEventRoutingKeys } from '../domain/transport.js';

/**
 * Runtime settings for HTTP, Redis, RabbitMQ, PostgreSQL history, and live-feed
 * idempotency behavior.
 */
export type LiveFeedConfig = {
  port: number;
  clientOrigin: string;
  systemAdminPortalUrl: string;
  redisUrl: string;
  rabbitMqUrl: string;
  rabbitMqExchange: string;
  rabbitMqQueue: string;
  rabbitMqRoutingKeys: string[];
  rabbitMqPrefetch: number;
  rabbitMqDeadLetterExchange: string;
  rabbitMqDeadLetterQueue: string;
  idempotencyTtlSeconds: number;
  liveFeedDatabaseUrl?: string;
  liveFeedDbPoolMax: number;
  liveFeedDbIdleTimeoutMs: number;
  liveFeedDbConnectionTimeoutMs: number;
  systemAdminTokenPublicKeyPath: string;
  systemAdminTokenPublicKeys?: Record<string, string>;
  systemAdminTokenIssuer: string;
  systemAdminTokenAudience: string;
  systemAdminTokenKid: string;
  adminSessionSecret?: string;
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
  const raw =
    process.env.LIVE_FEED_RABBITMQ_ROUTING_KEYS ?? process.env.LIVE_FEED_RABBITMQ_ROUTING_KEY;
  if (!raw) {
    return Object.values(integrationEventRoutingKeys);
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
  const username = encodeURIComponent(
    process.env.RABBITMQ_USERNAME ?? process.env.RABBITMQ_DEFAULT_USER ?? 'auction',
  );
  const password = encodeURIComponent(
    process.env.RABBITMQ_PASSWORD ?? process.env.RABBITMQ_DEFAULT_PASS ?? 'change_me_in_local_env',
  );
  const virtualHost = process.env.RABBITMQ_VHOST
    ? `/${encodeURIComponent(process.env.RABBITMQ_VHOST)}`
    : '';

  return `amqp://${username}:${password}@${host}:${port}${virtualHost}`;
}

function publicKeysFromEnv(fallbackPath: string, fallbackKid: string): Record<string, string> {
  const raw = process.env.SYSTEM_ADMIN_TOKEN_PUBLIC_KEYS;
  if (!raw) return { [fallbackKid]: fallbackPath };

  const entries = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const keys: Record<string, string> = {};
  for (const entry of entries) {
    const separator = entry.indexOf('=');
    if (separator <= 0 || separator === entry.length - 1) {
      throw new Error('SYSTEM_ADMIN_TOKEN_PUBLIC_KEYS must contain kid=path entries.');
    }
    const kid = entry.slice(0, separator).trim();
    const path = entry.slice(separator + 1).trim();
    if (!kid || !path || keys[kid])
      throw new Error('SYSTEM_ADMIN_TOKEN_PUBLIC_KEYS contains an invalid or duplicate kid.');
    keys[kid] = resolve(serviceRootForConfig(), path);
  }
  return keys;
}

function serviceRootForConfig(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '../..');
}

/**
 * Loads live-feed configuration from environment variables with optional test overrides.
 */
export function loadConfig(overrides: Partial<LiveFeedConfig> = {}): LiveFeedConfig {
  const serviceRoot = serviceRootForConfig();
  const publicKeyPath = resolve(
    serviceRoot,
    process.env.SYSTEM_ADMIN_TOKEN_PUBLIC_KEY_PATH ?? 'config/system-admin-public.pem',
  );
  const publicKeyKid = process.env.SYSTEM_ADMIN_TOKEN_KID ?? 'system-admin-development-1';
  const config: LiveFeedConfig = {
    port: numberFromEnv('PORT', 3001),
    clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:8000',
    systemAdminPortalUrl: process.env.SYSTEM_ADMIN_PORTAL_URL ?? 'http://localhost:5099',
    redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
    rabbitMqUrl: rabbitMqUrlFromEnv(),
    rabbitMqExchange: process.env.RABBITMQ_EXCHANGE ?? 'auction.events',
    rabbitMqQueue: process.env.LIVE_FEED_RABBITMQ_QUEUE ?? 'live-feed.bid-events',
    rabbitMqRoutingKeys: routingKeysFromEnv(),
    rabbitMqPrefetch: numberFromEnv('LIVE_FEED_RABBITMQ_PREFETCH', 10),
    rabbitMqDeadLetterExchange: process.env.LIVE_FEED_RABBITMQ_DLX ?? 'live-feed.dead-letter',
    rabbitMqDeadLetterQueue: process.env.LIVE_FEED_RABBITMQ_DLQ ?? 'live-feed.bid-events.dlq',
    idempotencyTtlSeconds: numberFromEnv('LIVE_FEED_IDEMPOTENCY_TTL_SECONDS', 86400),
    liveFeedDatabaseUrl: process.env.LIVE_FEED_DATABASE_URL,
    liveFeedDbPoolMax: numberFromEnv('LIVE_FEED_DB_POOL_MAX', 5),
    liveFeedDbIdleTimeoutMs: numberFromEnv('LIVE_FEED_DB_IDLE_TIMEOUT_MS', 10000),
    liveFeedDbConnectionTimeoutMs: numberFromEnv('LIVE_FEED_DB_CONNECTION_TIMEOUT_MS', 2000),
    systemAdminTokenPublicKeyPath: publicKeyPath,
    systemAdminTokenPublicKeys: publicKeysFromEnv(publicKeyPath, publicKeyKid),
    systemAdminTokenIssuer: process.env.SYSTEM_ADMIN_TOKEN_ISSUER ?? 'dbap-system-admin',
    systemAdminTokenAudience: process.env.SYSTEM_ADMIN_TOKEN_AUDIENCE ?? 'live-feed-admin',
    systemAdminTokenKid: publicKeyKid,
    adminSessionSecret: process.env.LIVE_FEED_ADMIN_SESSION_SECRET,
    ...overrides,
  };

  if (process.env.NODE_ENV === 'production') {
    if (
      !config.systemAdminTokenIssuer ||
      !config.systemAdminTokenAudience ||
      !config.systemAdminTokenKid ||
      !config.adminSessionSecret ||
      config.adminSessionSecret.length < 32 ||
      !config.systemAdminTokenPublicKeys ||
      Object.keys(config.systemAdminTokenPublicKeys).length === 0 ||
      Object.entries(config.systemAdminTokenPublicKeys).some(
        ([kid, path]) => !kid || !isAbsolute(path) || !existsSync(path),
      ) ||
      !config.systemAdminTokenPublicKeys[config.systemAdminTokenKid]
    ) {
      throw new Error('System-admin Live Feed authentication configuration is incomplete.');
    }
  }

  return config;
}
