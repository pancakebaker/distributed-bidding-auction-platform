/**
 * Tests the protected admin route and login boundary.
 */
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';
import express from 'express';
import { AdminAuth } from '../../src/transport/http/admin/admin-auth.js';
import { registerAdminRoutes } from '../../src/transport/http/admin/admin-route.js';
import type { LiveFeedDashboardSnapshot } from '../../src/application/diagnostics/get-live-feed-dashboard.js';

const snapshot: LiveFeedDashboardSnapshot = {
  service: { name: 'live-feed-service', status: 'ok', pid: 1, nodeVersion: 'v24', uptimeSeconds: 1 },
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

async function startApp(app: express.Express): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = createServer(app).listen(0);
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');

  return {
    baseUrl: 'http://127.0.0.1:' + address.port,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

void test('admin page redirects without a valid session and serves SSR after login', async () => {
  const app = express();
  const auth = new AdminAuth({ username: 'admin', password: 'password', secret: 'test-secret' });
  registerAdminRoutes(app, {
    auth,
    assetDirectory: 'dist/ui',
    publicAdminDirectory: 'public/admin',
    getSnapshot: () => snapshot,
  });
  const server = await startApp(app);

  try {
    const unauthorized = await fetch(server.baseUrl + '/admin/live-feed', { redirect: 'manual' });
    assert.equal(unauthorized.status, 302);
    assert.equal(unauthorized.headers.get('location'), '/admin/login');
    assert.equal(unauthorized.headers.get('content-security-policy')?.includes("frame-ancestors 'none'"), true);

    const login = await fetch(server.baseUrl + '/admin/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'username=admin&password=password',
      redirect: 'manual',
    });
    assert.equal(login.status, 302);
    const cookie = login.headers.get('set-cookie');
    assert.ok(cookie);

    const page = await fetch(server.baseUrl + '/admin/live-feed', {
      headers: { cookie: cookie.split(';')[0] },
    });
    const html = await page.text();
    assert.equal(page.status, 200);
    assert.match(html, /What is the Live Feed Service doing right now/);
    assert.doesNotMatch(html, /password/);
  } finally {
    await server.close();
  }
});
