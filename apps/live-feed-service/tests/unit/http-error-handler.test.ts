/**
 * Tests for centralized HTTP error responses.
 */
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';
import express from 'express';
import { ApplicationError } from '../../src/application/errors/application-error.js';
import { createHttpErrorHandler } from '../../src/transport/http/error-handler.js';

async function request(app: express.Express, path: string): Promise<{ status: number; body: string }> {
  const server = createServer(app).listen(0);
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const response = await fetch(`http://127.0.0.1:${address.port}${path}`);
  const body = await response.text();
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  return { status: response.status, body };
}

void test('known errors map to safe classified responses', async () => {
  const app = express();
  app.get('/known', (_request, _response, next) =>
    next(new ApplicationError('invalid request', 400, 'invalid_request')),
  );
  app.use(createHttpErrorHandler());

  const result = await request(app, '/known');
  assert.equal(result.status, 400);
  assert.deepEqual(JSON.parse(result.body), { error: 'invalid_request', message: 'invalid request' });
});

void test('unknown errors return a generic response without internal details', async () => {
  const app = express();
  app.get('/unknown', (_request, _response, next) => next(new Error('secret connection string')));
  app.use(createHttpErrorHandler());

  const result = await request(app, '/unknown');
  assert.equal(result.status, 500);
  assert.deepEqual(JSON.parse(result.body), { error: 'internal_error', message: 'Internal server error.' });
  assert.doesNotMatch(result.body, /secret connection string/);
});

void test('successful responses remain unchanged', async () => {
  const app = express();
  app.get('/health', (_request, response) => response.json({ status: 'ok' }));
  app.use(createHttpErrorHandler());

  const result = await request(app, '/health');
  assert.equal(result.status, 200);
  assert.deepEqual(JSON.parse(result.body), { status: 'ok' });
});
