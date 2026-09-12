import assert from 'node:assert/strict';
import { createSign, generateKeyPairSync, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import express from 'express';
import test from 'node:test';
import { createClient } from 'redis';
import type { RedisClientType } from 'redis';
import { RedisAdminTokenReplayConsumer } from '../../src/infrastructure/cache/redis-admin-token-replay-consumer.js';
import { JwtAdminTokenVerifier } from '../../src/infrastructure/auth/jwt-admin-token-verifier.js';
import { registerAdminRoutes } from '../../src/transport/http/admin/admin-route.js';
import { AdminAuth } from '../../src/transport/http/admin/admin-auth.js';
import type { LiveFeedDashboardSnapshot } from '../../src/application/diagnostics/get-live-feed-dashboard.js';

const redisUrl = process.env.LIVE_FEED_TEST_REDIS_URL ?? 'redis://localhost:6379/1';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const snapshot: LiveFeedDashboardSnapshot = {
  service: {
    name: 'live-feed-service',
    status: 'ok',
    pid: 1,
    nodeVersion: 'v24',
    uptimeSeconds: 1,
  },
  runtime: {
    eventLoop: { utilization: 0, delayMs: { min: 0, max: 0, mean: 0, p50: 0, p95: 0, p99: 0 } },
    memory: { rss: 1, heapTotal: 1, heapUsed: 1, external: 1, arrayBuffers: 1 },
  },
  messaging: { rabbitMqConnected: true },
  redis: { connected: true },
  websocket: { connectedClients: 0, activeRooms: 0 },
  recentActivity: [],
  database: { configured: false, available: false, totalCount: 0, idleCount: 0, waitingCount: 0 },
};
function encode(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function createToken(jti: string, expiresAt: Date): string {
  const header = encode({ alg: 'RS256', typ: 'JWT' });
  const claims = encode({
    sub: '1',
    email: 'admin@example.test',
    role: 'admin',
    permissions: ['access-live-feed-admin'],
    iss: 'auction-client',
    aud: 'live-feed-admin',
    iat: Math.floor(Date.now() / 1000) - 1,
    exp: Math.floor(expiresAt.getTime() / 1000),
    jti,
  });
  const signer = createSign('RSA-SHA256');
  signer.update(header + '.' + claims);
  signer.end();
  return header + '.' + claims + '.' + signer.sign(privateKey).toString('base64url');
}

async function connectRedis(): Promise<RedisClientType> {
  const redis = createClient({ url: redisUrl }) as RedisClientType;
  await redis.connect();
  return redis;
}

async function deleteReplayKeys(redis: RedisClientType, keys: string[]): Promise<void> {
  if (keys.length > 0) await redis.del(keys);
}

void test('Redis replay consumption is atomic, shared, and expiry-bound', async () => {
  const firstRedis = await connectRedis();
  const secondRedis = await connectRedis();
  const first = new RedisAdminTokenReplayConsumer(firstRedis);
  const second = new RedisAdminTokenReplayConsumer(secondRedis);
  const jti = `integration-${randomUUID()}`;
  const otherJti = `integration-${randomUUID()}`;
  const expiresAt = new Date(Date.now() + 2_000);
  const keys = [first.replayKey(jti), first.replayKey(otherJti)];

  try {
    assert.deepEqual(await first.consume(jti, expiresAt), { outcome: 'consumed' });
    assert.deepEqual(await second.consume(jti, expiresAt), { outcome: 'already_consumed' });
    assert.deepEqual(await second.consume(otherJti, expiresAt), { outcome: 'consumed' });
    assert.equal(await firstRedis.exists(keys[0]), 1);
    assert.equal(await firstRedis.get(keys[0]), '1');
    assert.ok((await firstRedis.pTTL(keys[0])) > 0);

    const concurrentJti = `integration-${randomUUID()}`;
    const concurrentKeys = [first.replayKey(concurrentJti)];
    const results = await Promise.all([
      first.consume(concurrentJti, expiresAt),
      second.consume(concurrentJti, expiresAt),
    ]);
    assert.equal(results.filter((result) => result.outcome === 'consumed').length, 1);
    assert.equal(results.filter((result) => result.outcome === 'already_consumed').length, 1);
    await deleteReplayKeys(firstRedis, concurrentKeys);

    const expiringJti = `integration-${randomUUID()}`;
    const expiringKey = first.replayKey(expiringJti);
    await first.consume(expiringJti, new Date(Date.now() + 100));
    await waitFor(async () => (await firstRedis.exists(expiringKey)) === 0);
  } finally {
    await deleteReplayKeys(firstRedis, keys);
    await firstRedis.quit();
    await secondRedis.quit();
  }
});

void test('real Redis protects the admin token exchange while the session remains reusable', async () => {
  const redis = await connectRedis();
  const replayConsumer = new RedisAdminTokenReplayConsumer(redis);
  const app = express();
  const verifier = new JwtAdminTokenVerifier({
    publicKey: publicPem,
    issuer: 'auction-client',
    audience: 'live-feed-admin',
  });
  registerAdminRoutes(app, {
    auth: new AdminAuth({ secret: 'integration-secret', secure: false }),
    tokenVerifier: verifier,
    replayConsumer,
    clientOrigin: 'http://localhost:8000',
    assetDirectory: 'dist/ui',
    publicAdminDirectory: 'public/admin',
    getSnapshot: () => snapshot,
  });
  const server = createServer(app).listen(0);
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const expiresAt = new Date(Date.now() + 60_000);
  const firstToken = createToken(`integration-${randomUUID()}`, expiresAt);
  const secondToken = createToken(`integration-${randomUUID()}`, expiresAt);

  try {
    const first = await fetch(baseUrl + '/admin/auth/token', {
      method: 'POST',
      headers: { authorization: `Bearer ${firstToken}` },
      redirect: 'manual',
    });
    assert.equal(first.status, 302);
    const cookie = first.headers.get('set-cookie')?.split(';')[0] ?? '';
    assert.match(cookie, /^live_feed_admin=/);

    const duplicate = await fetch(baseUrl + '/admin/auth/token', {
      method: 'POST',
      headers: { authorization: `Bearer ${firstToken}` },
    });
    assert.equal(duplicate.status, 401);
    assert.equal(duplicate.headers.has('set-cookie'), false);

    const different = await fetch(baseUrl + '/admin/auth/token', {
      method: 'POST',
      headers: { authorization: `Bearer ${secondToken}` },
      redirect: 'manual',
    });
    assert.equal(different.status, 302);
    assert.match(different.headers.get('set-cookie') ?? '', /^live_feed_admin=/);

    const session = await fetch(baseUrl + '/admin/live-feed', { headers: { cookie } });
    assert.equal(session.status, 200);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await redis.quit();
  }
});

async function waitFor(condition: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (!(await condition())) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for Redis replay key expiry.');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
