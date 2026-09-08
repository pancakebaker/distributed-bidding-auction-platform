/**
 * Tests for idempotent ordered runtime cleanup.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createShutdownCoordinator } from '../../src/infrastructure/runtime/shutdown-coordinator.js';

void test('shutdown coordinator runs cleanup once and preserves order', async () => {
  const calls: string[] = [];
  const shutdown = createShutdownCoordinator([
    { name: 'consumer', run: () => calls.push('consumer') },
    { name: 'http', run: () => calls.push('http') },
    { name: 'redis', run: () => calls.push('redis') },
  ]);

  await Promise.all([shutdown(), shutdown()]);

  assert.deepEqual(calls, ['consumer', 'http', 'redis']);
});

void test('shutdown coordinator continues cleanup after a step fails', async () => {
  const calls: string[] = [];
  const errors: string[] = [];
  const shutdown = createShutdownCoordinator(
    [
      {
        name: 'consumer',
        run: () => {
          calls.push('consumer');
          throw new Error('closed');
        },
      },
      { name: 'http', run: () => calls.push('http') },
    ],
    (step) => errors.push(step.name),
  );

  await shutdown();

  assert.deepEqual(calls, ['consumer', 'http']);
  assert.deepEqual(errors, ['consumer']);
});
