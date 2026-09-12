import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import { integrationEventRoutingKeys } from '../../src/domain/transport.js';
import { loadConfig } from '../../src/config/config.js';

const routingKeyEnvironmentNames = [
  'LIVE_FEED_RABBITMQ_ROUTING_KEY',
  'LIVE_FEED_RABBITMQ_ROUTING_KEYS',
  'SYSTEM_ADMIN_TOKEN_PUBLIC_KEY_PATH',
  'RABBITMQ_EXCHANGE',
  'LIVE_FEED_RABBITMQ_QUEUE',
  'LIVE_FEED_RABBITMQ_DLX',
  'LIVE_FEED_RABBITMQ_DLQ',
] as const;

type RoutingKeyEnvironment = Partial<Record<(typeof routingKeyEnvironmentNames)[number], string>>;

function withRoutingKeyEnvironment<T>(environment: RoutingKeyEnvironment, callback: () => T): T {
  const previous = new Map(routingKeyEnvironmentNames.map((name) => [name, process.env[name]]));

  for (const name of routingKeyEnvironmentNames) {
    delete process.env[name];
  }
  Object.assign(process.env, environment);

  try {
    return callback();
  } finally {
    for (const name of routingKeyEnvironmentNames) {
      const value = previous.get(name);
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }
}

void test('configured public-key path is honored', () => {
  const configuredPath = 'provisioned/system-admin-public.pem';
  const config = withRoutingKeyEnvironment(
    { SYSTEM_ADMIN_TOKEN_PUBLIC_KEY_PATH: configuredPath },
    () => loadConfig(),
  );

  assert.equal(config.systemAdminTokenPublicKeyPath, resolve(process.cwd(), configuredPath));
});
void test('defaults to every integration routing key', () => {
  const config = withRoutingKeyEnvironment({}, () => loadConfig());

  assert.deepEqual(config.rabbitMqRoutingKeys, Object.values(integrationEventRoutingKeys));
});

void test('normalizes the legacy single-key override into the canonical collection', () => {
  const config = withRoutingKeyEnvironment(
    { LIVE_FEED_RABBITMQ_ROUTING_KEY: integrationEventRoutingKeys.auctionClosed },
    () => loadConfig(),
  );

  assert.deepEqual(config.rabbitMqRoutingKeys, [integrationEventRoutingKeys.auctionClosed]);
});

void test('plural routing keys take precedence and topology overrides remain configurable', () => {
  const config = withRoutingKeyEnvironment(
    {
      LIVE_FEED_RABBITMQ_ROUTING_KEY: integrationEventRoutingKeys.bidAccepted,
      LIVE_FEED_RABBITMQ_ROUTING_KEYS: `${integrationEventRoutingKeys.auctionClosed}, ${integrationEventRoutingKeys.winnerSelected}`,
      RABBITMQ_EXCHANGE: 'custom.exchange',
      LIVE_FEED_RABBITMQ_QUEUE: 'custom.queue',
      LIVE_FEED_RABBITMQ_DLX: 'custom.dlx',
      LIVE_FEED_RABBITMQ_DLQ: 'custom.dlq',
    },
    () => loadConfig(),
  );

  assert.deepEqual(config.rabbitMqRoutingKeys, [
    integrationEventRoutingKeys.auctionClosed,
    integrationEventRoutingKeys.winnerSelected,
  ]);
  assert.equal(config.rabbitMqExchange, 'custom.exchange');
  assert.equal(config.rabbitMqQueue, 'custom.queue');
  assert.equal(config.rabbitMqDeadLetterExchange, 'custom.dlx');
  assert.equal(config.rabbitMqDeadLetterQueue, 'custom.dlq');
});
