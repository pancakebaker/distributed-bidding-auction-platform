import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';
import express from 'express';
import { AdminAuth } from '../../src/transport/http/admin/admin-auth.js';
import { registerAdminRoutes } from '../../src/transport/http/admin/admin-route.js';
import { adminRoutes } from '../../src/transport/http/admin/admin-routes.js';
import type {
  AdminTokenReplayConsumer,
  AdminTokenReplayConsumeResult,
} from '../../src/application/ports/admin-token-replay-consumer.js';
import type {
  AdminTokenClaims,
  AdminTokenVerifier,
} from '../../src/application/ports/admin-token-verifier.js';
import type {
  AdminHandoffClaims,
  AdminHandoffStore,
} from '../../src/application/ports/admin-handoff-store.js';
import type { LiveFeedDashboardSnapshot } from '../../src/application/diagnostics/get-live-feed-dashboard.js';

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

async function startApp(
  app: express.Express,
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = createServer(app).listen(0);
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return {
    baseUrl: 'http://127.0.0.1:' + address.port,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

const claims: AdminTokenClaims = {
  sub: '1',
  email: 'admin@example.test',
  role: 'admin',
  permissions: ['access-live-feed-admin'],
  iss: 'auction-client',
  aud: 'live-feed-admin',
  iat: 1,
  exp: 9_999_999_999,
};
const verifier: AdminTokenVerifier = {
  verify: (token) => {
    if (token !== 'valid-token') throw new Error('invalid');
    return claims;
  },
};

class TestAdminTokenReplayConsumer implements AdminTokenReplayConsumer {
  public readonly calls: Array<{ jti: string; expiresAt: Date }> = [];
  public outcome: AdminTokenReplayConsumeResult = { outcome: 'consumed' };
  public error: Error | undefined;

  public consume(jti: string, expiresAt: Date): Promise<AdminTokenReplayConsumeResult> {
    this.calls.push({ jti, expiresAt });
    if (this.error) return Promise.reject(this.error);
    return Promise.resolve(this.outcome);
  }
}

class TestAdminHandoffStore implements AdminHandoffStore {
  public created: AdminHandoffClaims | undefined;
  public consumed = false;

  public create(claims: AdminHandoffClaims): Promise<string> {
    this.created = claims;
    return Promise.resolve('opaque-handoff-code');
  }

  public consume(code: string): Promise<AdminHandoffClaims | undefined> {
    if (code !== 'opaque-handoff-code' || this.consumed) return Promise.resolve(undefined);
    this.consumed = true;
    return Promise.resolve(this.created);
  }
}

function registerTestAdminRoutes(
  app: express.Express,
  tokenVerifier: AdminTokenVerifier = verifier,
  replayConsumer: TestAdminTokenReplayConsumer = new TestAdminTokenReplayConsumer(),
): TestAdminTokenReplayConsumer {
  registerAdminRoutes(app, {
    auth: new AdminAuth({ secret: 'test-secret', secure: false }),
    tokenVerifier,
    replayConsumer,
    clientOrigin: 'http://localhost:8000',
    assetDirectory: 'dist/ui',
    publicAdminDirectory: 'public/admin',
    getSnapshot: () => snapshot,
  });
  return replayConsumer;
}
void test('admin token exchange creates a session and serves SSR without Node credentials', async () => {
  const app = express();
  const auth = new AdminAuth({ secret: 'test-secret', secure: false });
  registerAdminRoutes(app, {
    auth,
    tokenVerifier: verifier,
    replayConsumer: new TestAdminTokenReplayConsumer(),
    clientOrigin: 'http://localhost:8000',
    assetDirectory: 'dist/ui',
    publicAdminDirectory: 'public/admin',
    getSnapshot: () => snapshot,
  });
  const server = await startApp(app);
  try {
    const unauthorized = await fetch(server.baseUrl + '/admin/live-feed', { redirect: 'manual' });
    assert.equal(unauthorized.status, 302);
    const exchange = await fetch(server.baseUrl + '/admin/auth/token', {
      method: 'POST',
      headers: { authorization: 'Bearer valid-token' },
      redirect: 'manual',
    });
    assert.equal(exchange.status, 302);
    assert.match(exchange.headers.get('set-cookie') ?? '', /Path=\//);
    const cookie = exchange.headers.get('set-cookie')?.split(';')[0] ?? '';
    const page = await fetch(server.baseUrl + '/admin/live-feed', { headers: { cookie } });
    const html = await page.text();
    assert.equal(page.status, 200);
    assert.match(html, /What is the Live Feed Service doing right now/);
    assert.doesNotMatch(html, /password/);
  } finally {
    await server.close();
  }
});

void test('invalid admin token is rejected without issuing a cookie', async () => {
  const app = express();
  registerAdminRoutes(app, {
    auth: new AdminAuth({ secret: 'test-secret' }),
    tokenVerifier: verifier,
    replayConsumer: new TestAdminTokenReplayConsumer(),
    clientOrigin: 'http://localhost:8000',
    assetDirectory: 'dist/ui',
    publicAdminDirectory: 'public/admin',
    getSnapshot: () => snapshot,
  });
  const server = await startApp(app);
  try {
    const response = await fetch(server.baseUrl + '/admin/auth/token', {
      method: 'POST',
      headers: { authorization: 'Bearer invalid-token' },
    });
    assert.equal(response.status, 401);
    assert.equal(response.headers.has('set-cookie'), false);
  } finally {
    await server.close();
  }
});

void test('duplicate admin token exchange is rejected without issuing a cookie', async () => {
  const app = express();
  const replayConsumer = new TestAdminTokenReplayConsumer();
  registerTestAdminRoutes(app, verifier, replayConsumer);
  const server = await startApp(app);
  try {
    const firstResponse = await fetch(server.baseUrl + '/admin/auth/token', {
      method: 'POST',
      headers: { authorization: 'Bearer valid-token' },
      redirect: 'manual',
    });
    assert.equal(firstResponse.status, 302);
    assert.match(firstResponse.headers.get('set-cookie') ?? '', /Path=\//);

    replayConsumer.outcome = { outcome: 'already_consumed' };
    const duplicateResponse = await fetch(server.baseUrl + '/admin/auth/token', {
      method: 'POST',
      headers: { authorization: 'Bearer valid-token' },
    });
    assert.equal(duplicateResponse.status, 401);
    assert.equal(duplicateResponse.headers.has('set-cookie'), false);
    assert.equal(replayConsumer.calls.length, 2);
  } finally {
    await server.close();
  }
});

void test('replay-store failure fails closed without issuing a cookie', async () => {
  const app = express();
  const replayConsumer = new TestAdminTokenReplayConsumer();
  replayConsumer.error = new Error('redis unavailable');
  registerTestAdminRoutes(app, verifier, replayConsumer);
  const server = await startApp(app);
  try {
    const response = await fetch(server.baseUrl + '/admin/auth/token', {
      method: 'POST',
      headers: { authorization: 'Bearer valid-token' },
    });
    assert.equal(response.status, 503);
    assert.equal(response.headers.has('set-cookie'), false);
  } finally {
    await server.close();
  }
});

void test('invalid JWT is rejected before replay consumption', async () => {
  const app = express();
  const replayConsumer = new TestAdminTokenReplayConsumer();
  const invalidVerifier: AdminTokenVerifier = {
    verify: () => {
      throw new Error('invalid');
    },
  };
  registerTestAdminRoutes(app, invalidVerifier, replayConsumer);
  const server = await startApp(app);
  try {
    const response = await fetch(server.baseUrl + '/admin/auth/token', {
      method: 'POST',
      headers: { authorization: 'Bearer invalid-token' },
    });
    assert.equal(response.status, 401);
    assert.equal(replayConsumer.calls.length, 0);
    assert.equal(response.headers.has('set-cookie'), false);
  } finally {
    await server.close();
  }
});

void test('exchange passes validated JTI expiry and accepts independent JTIs', async () => {
  const secondClaims = { ...claims, sub: '2', jti: 'second-jti' };
  const tokenClaims = new Map([
    ['first-token', claims],
    ['second-token', secondClaims],
  ]);
  const tokenVerifier: AdminTokenVerifier = {
    verify: (token) =>
      tokenClaims.get(token) ??
      (() => {
        throw new Error('invalid');
      })(),
  };
  const app = express();
  const replayConsumer = new TestAdminTokenReplayConsumer();
  registerTestAdminRoutes(app, tokenVerifier, replayConsumer);
  const server = await startApp(app);
  try {
    for (const token of ['first-token', 'second-token']) {
      const response = await fetch(server.baseUrl + '/admin/auth/token', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        redirect: 'manual',
      });
      assert.equal(response.status, 302);
      assert.match(response.headers.get('set-cookie') ?? '', /Path=\//);
    }
    assert.deepEqual(replayConsumer.calls, [
      { jti: claims.jti, expiresAt: new Date(claims.exp * 1000) },
      { jti: secondClaims.jti, expiresAt: new Date(secondClaims.exp * 1000) },
    ]);
  } finally {
    await server.close();
  }
});

void test('admin handoff paths remain stable', () => {
  assert.deepEqual(adminRoutes, {
    liveFeed: '/admin/live-feed',
    tokenExchange: '/admin/auth/token',
  });
});

void test('system-admin exchange creates an opaque one-time browser handoff without returning a JWT', async () => {
  const app = express();
  const handoffStore = new TestAdminHandoffStore();
  const systemClaims: AdminTokenClaims = {
    sub: 'system-admin-subject',
    role: 'SystemAdministrator',
    permissions: ['system.monitor', 'livefeed.admin', 'system.diagnostics'],
    iss: 'dbap-system-admin',
    aud: 'live-feed-admin',
    iat: 1,
    exp: 9_999_999_999,
    jti: 'system-jti',
  };
  registerAdminRoutes(app, {
    auth: new AdminAuth({ secret: 'test-secret', secure: false }),
    tokenVerifier: verifier,
    systemTokenVerifier: { verify: () => systemClaims },
    replayConsumer: new TestAdminTokenReplayConsumer(),
    handoffStore,
    clientOrigin: 'http://localhost:8000',
    assetDirectory: 'dist/ui',
    publicAdminDirectory: 'public/admin',
    getSnapshot: () => snapshot,
  });
  const server = await startApp(app);
  try {
    const exchange = await fetch(server.baseUrl + '/admin/auth/system-token', {
      method: 'POST',
      headers: { authorization: 'Bearer system-token' },
    });
    assert.equal(exchange.status, 200);
    const body = (await exchange.json()) as { handoffCode?: string; token?: string };
    assert.equal(body.handoffCode, 'opaque-handoff-code');
    assert.equal(body.token, undefined);

    const handoff = await fetch(server.baseUrl + '/admin/auth/handoff?code=opaque-handoff-code', {
      redirect: 'manual',
    });
    assert.equal(handoff.status, 302);
    assert.match(handoff.headers.get('set-cookie') ?? '', /HttpOnly/);
    assert.equal(handoff.headers.get('location'), '/admin/live-feed');

    const replay = await fetch(server.baseUrl + '/admin/auth/handoff?code=opaque-handoff-code', {
      redirect: 'manual',
    });
    assert.equal(replay.status, 302);
    assert.equal(replay.headers.get('set-cookie'), null);
  } finally {
    await server.close();
  }
});
