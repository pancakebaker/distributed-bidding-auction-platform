/**
 * Tests the read-only live-feed diagnostics streaming HTTP adapter.
 */
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';
import express from 'express';
import { getContext, runWithContext } from '../../src/infrastructure/runtime/async-context.js';
import { createHttpErrorHandler } from '../../src/transport/http/error-handler.js';
import { registerLiveFeedStreamRoute } from '../../src/transport/http/live-feed-stream-route.js';

async function request(app: express.Express, path: string, headers: Record<string, string> = {}) {
  const server = createServer(app).listen(0);
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');

  try {
    return await fetch(`http://127.0.0.1:${address.port}${path}`, { headers });
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

void test('diagnostics stream returns ordered NDJSON and preserves HTTP context', async () => {
  const app = express();
  app.use((request, _response, next) =>
    runWithContext({ correlationId: request.get('x-correlation-id') ?? undefined }, next),
  );
  registerLiveFeedStreamRoute(app, () => [
    { type: 'runtime', correlationId: getContext()?.correlationId },
    { type: 'memory', heapUsed: 10 },
  ]);
  app.use(createHttpErrorHandler());

  const response = await request(app, '/diagnostics/live-feed/stream', {
    'x-correlation-id': 'stream-correlation',
  });
  const lines = (await response.text())
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as Record<string, unknown>);

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /^application\/x-ndjson/);
  assert.deepEqual(lines, [
    { type: 'runtime', correlationId: 'stream-correlation' },
    { type: 'memory', heapUsed: 10 },
  ]);
});

void test('source errors use centralized safe HTTP error handling', async () => {
  const app = express();
  registerLiveFeedStreamRoute(app, () => {
    throw new Error('private stream failure');
  });
  app.use(createHttpErrorHandler());

  const response = await request(app, '/diagnostics/live-feed/stream');
  const body = await response.text();

  assert.equal(response.status, 500);
  assert.deepEqual(JSON.parse(body), {
    error: 'internal_error',
    message: 'Internal server error.',
  });
  assert.doesNotMatch(body, /private stream failure/);
});
