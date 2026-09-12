import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';
import express from 'express';
import { AdminAuth } from '../../src/transport/http/admin/admin-auth.js';
import { registerAdminRoutes } from '../../src/transport/http/admin/admin-route.js';
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

class TestAdminTokenReplayConsumer implements AdminTokenReplayConsumer {
  public readonly calls: Array<{ jti: string; expiresAt: Date }> = [];
  public outcome: AdminTokenReplayConsumeResult = { outcome: 'consumed' };

  public consume(jti: string, expiresAt: Date): Promise<AdminTokenReplayConsumeResult> {
    this.calls.push({ jti, expiresAt });
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

const claims: AdminTokenClaims = {
  sub: 'system-admin-subject',
  role: 'SystemAdministrator',
  permissions: ['system.monitor', 'livefeed.admin', 'system.diagnostics'],
  iss: 'dbap-system-admin',
  aud: 'live-feed-admin',
  iat: 1,
  exp: 9_999_999_999,
  jti: 'system-jti',
};
const verifier: AdminTokenVerifier = {
  verify: (token) =>
    token === 'valid-token'
      ? claims
      : (() => {
          throw new Error('invalid');
        })(),
};

function registerTestAdminRoutes(
  app: express.Express,
  replayConsumer = new TestAdminTokenReplayConsumer(),
  handoffStore = new TestAdminHandoffStore(),
) {
  registerAdminRoutes(app, {
    auth: new AdminAuth({ secret: 'test-secret', secure: false }),
    replayConsumer,
    assetDirectory: 'dist/ui',
    publicAdminDirectory: 'public/admin',
    systemAdminPortalUrl: 'http://localhost:5099',
    systemTokenVerifier: verifier,
    handoffStore,
    getSnapshot: () => snapshot,
  });
  return { replayConsumer, handoffStore };
}

void test('anonymous admin page is rejected', async () => {
  const app = express();
  registerTestAdminRoutes(app);
  const server = await startApp(app);
  try {
    const response = await fetch(server.baseUrl + '/admin/live-feed', { redirect: 'manual' });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/admin/login');
  } finally {
    await server.close();
  }
});

void test('admin login redirects to the independent Operations Portal', async () => {
  const app = express();
  registerTestAdminRoutes(app);
  const server = await startApp(app);
  try {
    const response = await fetch(server.baseUrl + '/admin/login', { redirect: 'manual' });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), 'http://localhost:5099/login');
  } finally {
    await server.close();
  }
});

void test('system-admin exchange creates a one-time opaque handoff without returning a JWT', async () => {
  const app = express();
  const setup = registerTestAdminRoutes(app);
  const server = await startApp(app);
  try {
    const exchange = await fetch(server.baseUrl + '/admin/auth/system-token', {
      method: 'POST',
      headers: { authorization: 'Bearer valid-token' },
    });
    assert.equal(exchange.status, 200);
    const body = (await exchange.json()) as { handoffCode?: string; token?: string };
    assert.equal(body.handoffCode, 'opaque-handoff-code');
    assert.equal(body.token, undefined);
    assert.equal(setup.replayConsumer.calls[0]?.jti, claims.jti);

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

void test('invalid or missing system-admin token is rejected without a cookie', async () => {
  const app = express();
  registerTestAdminRoutes(app);
  const server = await startApp(app);
  try {
    const missing = await fetch(server.baseUrl + '/admin/auth/system-token', { method: 'POST' });
    assert.equal(missing.status, 401);
    const invalid = await fetch(server.baseUrl + '/admin/auth/system-token', {
      method: 'POST',
      headers: { authorization: 'Bearer invalid-token' },
    });
    assert.equal(invalid.status, 401);
    assert.equal(invalid.headers.has('set-cookie'), false);
  } finally {
    await server.close();
  }
});
