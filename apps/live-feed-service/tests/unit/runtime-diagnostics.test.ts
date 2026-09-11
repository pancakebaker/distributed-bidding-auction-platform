/**
 * Tests the read-only HTTP endpoints for Phase 7 runtime diagnostics.
 */
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';
import express from 'express';
import { createHttpErrorHandler } from '../../src/transport/http/error-handler.js';
import { registerRuntimeChildProcessRoute } from '../../src/transport/http/runtime-child-process-route.js';
import { registerRuntimeThreadPoolRoute } from '../../src/transport/http/runtime-thread-pool-route.js';

async function request(
  app: express.Express,
  path: string,
): Promise<{ status: number; body: string }> {
  const server = createServer(app).listen(0);
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`);
    return { status: response.status, body: await response.text() };
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

void test('thread-pool diagnostics endpoint returns safe metadata', async () => {
  const app = express();
  registerRuntimeThreadPoolRoute(app);
  app.use(createHttpErrorHandler());

  const response = await request(app, '/diagnostics/runtime/thread-pool');
  const body = JSON.parse(response.body) as { operation: string; threadPoolBacked: boolean };

  assert.equal(response.status, 200);
  assert.equal(body.operation, 'pbkdf2');
  assert.equal(body.threadPoolBacked, true);
});

void test('child-process diagnostics endpoint returns isolated metadata', async () => {
  const app = express();
  registerRuntimeChildProcessRoute(app);
  app.use(createHttpErrorHandler());

  const response = await request(app, '/diagnostics/runtime/child-process');
  const body = JSON.parse(response.body) as { isolatedProcess: boolean; pid: number };

  assert.equal(response.status, 200);
  assert.equal(body.isolatedProcess, true);
  assert.notEqual(body.pid, process.pid);
});
