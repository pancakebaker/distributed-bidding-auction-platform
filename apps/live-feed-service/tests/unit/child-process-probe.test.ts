/**
 * Tests the fixed, isolated child-process runtime probe.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseChildProbeOutput,
  runChildProcessProbe,
} from '../../src/infrastructure/runtime/child-process-probe.js';

void test('child-process probe returns isolated runtime metadata', async () => {
  const result = await runChildProcessProbe();

  assert.equal(result.isolatedProcess, true);
  assert.notEqual(result.pid, process.pid);
  assert.equal(result.nodeVersion, process.version);
  assert.equal(result.platform, process.platform);
  assert.equal(result.architecture, process.arch);
});

void test('child-process probe rejects malformed output safely', () => {
  assert.throws(
    () => parseChildProbeOutput('not-json', process.pid),
    (error: unknown) => error instanceof Error && error.name === 'ApplicationError',
  );
  assert.throws(
    () => parseChildProbeOutput(JSON.stringify({ pid: process.pid }), process.pid),
    (error: unknown) => error instanceof Error && error.name === 'ApplicationError',
  );
});

void test('child-process probe aborts and cleans up the request-local child', async () => {
  const controller = new AbortController();
  const operation = runChildProcessProbe({ signal: controller.signal });
  controller.abort();

  await assert.rejects(
    operation,
    (error: unknown) => error instanceof Error && error.name === 'ApplicationError',
  );
});
