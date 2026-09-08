/**
 * Tests the read-only libuv thread-pool diagnostic and event-loop responsiveness.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { runLibuvThreadPoolDiagnostic } from '../../src/infrastructure/runtime/libuv-thread-pool-diagnostic.js';

void test('pbkdf2 diagnostic returns bounded safe metadata', async () => {
  const result = await runLibuvThreadPoolDiagnostic({ iterations: 2, keyLength: 8 });

  assert.deepEqual(Object.keys(result).sort(), [
    'durationMs',
    'iterations',
    'keyLength',
    'operation',
    'threadPoolBacked',
  ]);
  assert.equal(result.operation, 'pbkdf2');
  assert.equal(result.iterations, 2);
  assert.equal(result.keyLength, 8);
  assert.equal(result.threadPoolBacked, true);
  assert.ok(Number.isFinite(result.durationMs));
  assert.ok(result.durationMs >= 0);
  assert.doesNotMatch(JSON.stringify(result), /diagnostic-input|diagnostic-salt/);
});

void test('multiple thread-pool operations leave the event loop available', async () => {
  let eventLoopCallbackRan = false;
  const operations = Array.from({ length: 4 }, () =>
    runLibuvThreadPoolDiagnostic({ iterations: 20_000, keyLength: 16 }),
  );
  const eventLoopTurn = new Promise<void>((resolve) => {
    setImmediate(() => {
      eventLoopCallbackRan = true;
      resolve();
    });
  });

  await eventLoopTurn;
  const results = await Promise.all(operations);

  assert.equal(eventLoopCallbackRan, true);
  assert.equal(results.length, 4);
  assert.ok(results.every((result) => result.threadPoolBacked));
});

void test('thread-pool diagnostic validates bounds and cancellation', async () => {
  await assert.rejects(
    runLibuvThreadPoolDiagnostic({ iterations: 0 }),
    (error: unknown) => error instanceof Error && error.name === 'ApplicationError',
  );

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    runLibuvThreadPoolDiagnostic({ signal: controller.signal }),
    (error: unknown) => error instanceof Error && error.name === 'ApplicationError',
  );
});
