/**
 * Tests for cleanup after partially successful startup.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { runWithStartupCleanup } from '../../src/infrastructure/runtime/startup.js';

void test('startup cleanup runs before the startup failure is rethrown', async () => {
  const calls: string[] = [];
  const failure = new Error('rabbitmq unavailable');

  await assert.rejects(
    runWithStartupCleanup(
      () => {
        calls.push('runtime-started');
        return Promise.reject(failure);
      },
      () => Promise.resolve(calls.push('resources-cleaned')),
    ),
    (error: unknown) => error === failure,
  );

  assert.deepEqual(calls, ['runtime-started', 'resources-cleaned']);
});
