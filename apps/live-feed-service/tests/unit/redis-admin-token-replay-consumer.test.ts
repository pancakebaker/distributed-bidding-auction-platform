import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  RedisAdminTokenReplayConsumer,
  type RedisAdminTokenReplayConsumerOptions,
} from '../../src/infrastructure/cache/redis-admin-token-replay-consumer.js';

type SetOptions = { NX: true; PX: number };

class FakeRedis {
  public readonly calls: Array<{ key: string; value: string; options: SetOptions }> = [];
  public nextResult: 'OK' | null = 'OK';
  public failure: Error | undefined;

  public set(key: string, value: string, options: SetOptions): Promise<'OK' | null> {
    this.calls.push({ key, value, options });
    if (this.failure) return Promise.reject(this.failure);
    return Promise.resolve(this.nextResult);
  }
}

function consumer(
  redis: FakeRedis,
  options: RedisAdminTokenReplayConsumerOptions = {},
): RedisAdminTokenReplayConsumer {
  return new RedisAdminTokenReplayConsumer(redis, options);
}

void test('successful NX set reports consumed with expiry-derived TTL', async () => {
  const redis = new FakeRedis();
  const now = Date.parse('2030-01-01T00:00:00.000Z');
  const expiresAt = new Date(now + 90_000);

  const result = await consumer(redis, { now: () => now }).consume('jti-1', expiresAt);

  assert.deepEqual(result, { outcome: 'consumed' });
  assert.equal(redis.calls[0]?.options.NX, true);
  assert.equal(redis.calls[0]?.options.PX, 90_000);
});

void test('NX conflict reports already consumed', async () => {
  const redis = new FakeRedis();
  redis.nextResult = null;

  const result = await consumer(redis, { now: () => 1_000 }).consume('jti-1', new Date(2_000));

  assert.deepEqual(result, { outcome: 'already_consumed' });
});

void test('Redis failures reject instead of becoming replay results', async () => {
  const redis = new FakeRedis();
  redis.failure = new Error('Redis unavailable');

  await assert.rejects(
    consumer(redis, { now: () => 1_000 }).consume('jti-1', new Date(2_000)),
    /Redis unavailable/,
  );
});

void test('expired or non-positive expiry is rejected without writing Redis state', async () => {
  const redis = new FakeRedis();
  const replayConsumer = consumer(redis, { now: () => 2_000 });

  await assert.rejects(
    replayConsumer.consume('expired', new Date(2_000)),
    /expiry must be in the future/,
  );
  await assert.rejects(
    replayConsumer.consume('invalid', new Date(Number.NaN)),
    /expiry must be in the future/,
  );
  assert.equal(redis.calls.length, 0);
});

void test('uses a deterministic hashed JTI under the service-local namespace', async () => {
  const redis = new FakeRedis();
  const jti = 'jti-1';
  const digest = createHash('sha256').update(jti, 'utf8').digest('hex');

  await consumer(redis, { now: () => 1_000 }).consume(jti, new Date(2_000));

  assert.equal(redis.calls[0]?.key, `live-feed:auth:consumed-jti:${digest}`);
  assert.doesNotMatch(redis.calls[0]?.key ?? '', /jti-1/);
  assert.equal(redis.calls[0]?.value, '1');
});
