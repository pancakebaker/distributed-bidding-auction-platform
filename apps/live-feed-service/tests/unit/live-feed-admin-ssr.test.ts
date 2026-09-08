/**
 * Tests SSR output and safe hydration state for the operations dashboard.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderLiveFeedAdmin, serializeInitialState } from '../../src/ui/server/render-live-feed-admin.js';

const snapshot = {
  service: {
    name: 'live-feed-service' as const,
    status: 'ok' as const,
    pid: 42,
    nodeVersion: 'v24.0.0',
    uptimeSeconds: 12,
  },
  runtime: {
    eventLoop: {
      utilization: 0.1,
      delayMs: { min: 1, max: 2, mean: 1, p50: 1, p95: 2, p99: 2 },
    },
    memory: { rss: 100, heapTotal: 80, heapUsed: 40, external: 10, arrayBuffers: 2 },
  },
  messaging: { rabbitMqConnected: true },
  redis: { connected: true },
  websocket: { connectedClients: 1, activeRooms: 2 },
  recentActivity: [
    {
      eventId: 'event-id',
      eventType: 'BidAccepted',
      auctionId: 'auction-id',
      aggregateVersion: 2,
      correlationId: 'correlation-id',
      receivedAt: '2026-01-01T00:00:00.000Z',
      outcome: 'applied' as const,
    },
  ],
  database: { configured: false, available: false, totalCount: 0, idleCount: 0, waitingCount: 0 },
};

void test('SSR includes meaningful dashboard markup and safe initial state', () => {
  const html = renderLiveFeedAdmin(snapshot);

  assert.match(html, /Live Feed Operations/);
  assert.match(html, /What is the Live Feed Service doing right now/);
  assert.match(html, /event-id/);
  assert.match(serializeInitialState(snapshot), /"service"/);
  assert.doesNotMatch(html, /password|redisUrl|rabbitMqUrl/);
});

void test('initial state escaping protects script markup characters', () => {
  const unsafe = {
    ...snapshot,
    recentActivity: [{ ...snapshot.recentActivity[0], eventType: '</script><script>alert(1)</script>' }],
  };
  const serialized = serializeInitialState(unsafe);

  assert.doesNotMatch(serialized, /<\/script>/i);
  assert.match(serialized, /\\u003c/);
});
