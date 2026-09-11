import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';
import express from 'express';
import { AdminAuth } from '../../src/transport/http/admin/admin-auth.js';
import { registerAdminRoutes } from '../../src/transport/http/admin/admin-route.js';
import type {
  AdminTokenClaims,
  AdminTokenVerifier,
} from '../../src/application/ports/admin-token-verifier.js';
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

void test('admin token exchange creates a session and serves SSR without Node credentials', async () => {
  const app = express();
  const auth = new AdminAuth({ secret: 'test-secret', secure: false });
  registerAdminRoutes(app, {
    auth,
    tokenVerifier: verifier,
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
