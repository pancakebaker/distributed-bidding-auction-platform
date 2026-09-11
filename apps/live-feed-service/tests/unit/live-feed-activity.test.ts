/**
 * Tests the read-only HTTP boundary for Worker Thread activity diagnostics.
 */
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';
import express from 'express';
import type { ActivityResult } from '../../src/application/activity/calculate-auction-activity.js';
import type { ActivityCalculator } from '../../src/application/ports/activity-calculator.js';
import { ApplicationError } from '../../src/application/errors/application-error.js';
import { createHttpErrorHandler } from '../../src/transport/http/error-handler.js';
import { registerLiveFeedActivityRoute } from '../../src/transport/http/live-feed-activity-route.js';
import { WorkerActivityCalculator } from '../../src/infrastructure/workers/worker-activity-calculator.js';

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

void test('activity endpoint returns the worker-backed diagnostic result', async () => {
  const app = express();
  const calculator = new WorkerActivityCalculator();
  registerLiveFeedActivityRoute(app, calculator, () => ({ samples: [1, 2, 3], iterations: 2 }));
  app.use(createHttpErrorHandler());

  try {
    const response = await request(app, '/diagnostics/live-feed/activity');
    const body = JSON.parse(response.body) as ActivityResult & { worker: { used: boolean } };

    assert.equal(response.status, 200);
    assert.equal(body.worker.used, true);
    assert.equal(body.sampleCount, 3);
    assert.equal(body.histogram.length, 5);
    assert.equal(typeof body.percentiles.p95, 'number');
  } finally {
    await calculator.close();
  }
});

void test('activity failures use the centralized safe HTTP error response', async () => {
  const app = express();
  const failingCalculator: ActivityCalculator = {
    calculate: () =>
      Promise.reject(new ApplicationError('private worker detail', 500, 'activity_worker_failed')),
  };
  registerLiveFeedActivityRoute(app, failingCalculator, () => ({ samples: [1], iterations: 1 }));
  app.use(createHttpErrorHandler());

  const response = await request(app, '/diagnostics/live-feed/activity');
  assert.equal(response.status, 500);
  assert.deepEqual(JSON.parse(response.body), {
    error: 'activity_worker_failed',
    message: 'Internal server error.',
  });
  assert.doesNotMatch(response.body, /private worker detail/);
});
