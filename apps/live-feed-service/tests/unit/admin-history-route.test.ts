/**
 * Tests authenticated history API and PDF response boundaries.
 */
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';
import express from 'express';
import { AdminAuth } from '../../src/transport/http/admin/admin-auth.js';
import { registerAdminHistoryRoutes } from '../../src/transport/http/admin/admin-history-route.js';
import { createHttpErrorHandler } from '../../src/transport/http/error-handler.js';
import type {
  LiveFeedHistoryFilters,
  LiveFeedHistoryResult,
} from '../../src/application/history/live-feed-history-types.js';
import type { LiveFeedHistoryStore } from '../../src/application/ports/live-feed-history-store.js';

const result: LiveFeedHistoryResult = {
  filters: {
    from: '2026-01-01T00:00:00.000Z',
    to: '2026-01-02T00:00:00.000Z',
    limit: 20,
  },
  rows: [
    {
      id: 1,
      eventId: 'event-1',
      auctionId: 'auction-1',
      eventType: 'BidAccepted',
      aggregateVersion: 2,
      correlationId: 'correlation-1',
      occurredAt: '2026-01-01T00:00:00.000Z',
      processedAt: '2026-01-01T00:00:01.000Z',
      outcome: 'applied',
    },
  ],
  count: 1,
};

async function startApp(app: express.Express): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = createServer(app).listen(0);
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

function fakeStore(queryResult: LiveFeedHistoryResult = result): LiveFeedHistoryStore {
  return {
    record: () => Promise.resolve(),
    query: (_filters: LiveFeedHistoryFilters) => Promise.resolve(queryResult),
    status: () => ({ configured: true, available: true, totalCount: 1, idleCount: 1, waitingCount: 0 }),
    close: () => Promise.resolve(),
  };
}

void test('history API requires admin auth and returns bounded filtered rows', async () => {
  const app = express();
  const auth = new AdminAuth({ secret: 'test-secret' });
  registerAdminHistoryRoutes(app, { auth, store: fakeStore() });
  app.use(createHttpErrorHandler());
  const server = await startApp(app);
  const cookie = auth.createSession();

  try {
    const unauthorized = await fetch(server.baseUrl + '/admin/api/history');
    assert.equal(unauthorized.status, 401);
    const response = await fetch(
      server.baseUrl +
        '/admin/api/history?from=2026-01-01T00%3A00%3A00.000Z&to=2026-01-02T00%3A00%3A00.000Z&outcome=applied',
      { headers: { cookie: cookie?.split(';')[0] ?? '' } },
    );
    assert.equal(response.status, 200);
    const body = (await response.json()) as LiveFeedHistoryResult & { displayTimezone: string };
    assert.equal(body.count, 1);
    assert.equal(body.displayTimezone, 'UTC');
    assert.equal(body.rows[0]?.eventType, 'BidAccepted');
  } finally {
    await server.close();
  }
});

void test('history PDF is authenticated, downloadable, and emits PDF bytes', async () => {
  const app = express();
  const auth = new AdminAuth({ secret: 'test-secret' });
  registerAdminHistoryRoutes(app, { auth, store: fakeStore() });
  app.use(createHttpErrorHandler());
  const server = await startApp(app);
  const cookie = auth.createSession();

  try {
    const response = await fetch(server.baseUrl + '/admin/api/history.pdf', {
      headers: { cookie: cookie?.split(';')[0] ?? '' },
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /^application\/pdf/);
    assert.match(response.headers.get('content-disposition') ?? '', /attachment; filename="live-feed-history-/);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.subarray(0, 4).toString(), '%PDF');
  } finally {
    await server.close();
  }
});

void test('history API rejects an over-large range without querying the store', async () => {
  let queried = false;
  const store = fakeStore();
  const app = express();
  const auth = new AdminAuth({ secret: 'test-secret' });
  registerAdminHistoryRoutes(app, {
    auth,
    store: {
      ...store,
      query: () => {
        queried = true;
        return Promise.resolve(result);
      },
    },
  });
  app.use(createHttpErrorHandler());
  const server = await startApp(app);
  const cookie = auth.createSession();

  try {
    const response = await fetch(
      server.baseUrl + '/admin/api/history?from=2026-01-01T00%3A00%3A00.000Z&to=2026-03-01T00%3A00%3A00.000Z',
      { headers: { cookie: cookie?.split(';')[0] ?? '' } },
    );
    assert.equal(response.status, 400);
    assert.equal(queried, false);
  } finally {
    await server.close();
  }
});
