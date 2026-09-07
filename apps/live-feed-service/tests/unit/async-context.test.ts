import assert from 'node:assert/strict';
import test from 'node:test';
import { getContext, getContextValue, runWithContext } from '../../src/infrastructure/runtime/async-context.js';

void test('context survives Promise and timer boundaries', async () => {
  await runWithContext({ correlationId: 'A', eventId: 'event-a' }, async () => {
    await Promise.resolve();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    assert.equal(getContextValue('correlationId'), 'A');
    assert.equal(getContext()?.eventId, 'event-a');
  });
});

void test('concurrent contexts remain isolated', async () => {
  const values = await Promise.all([
    runWithContext({ correlationId: 'A' }, async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      return getContextValue('correlationId');
    }),
    runWithContext({ correlationId: 'B' }, () => Promise.resolve(getContextValue('correlationId'))),
  ]);

  assert.deepEqual(values, ['A', 'B']);
});

void test('nested contexts restore the outer context and errors do not leak', async () => {
  runWithContext({ correlationId: 'outer' }, () => {
    runWithContext({ correlationId: 'inner' }, () => {
      assert.equal(getContextValue('correlationId'), 'inner');
    });
    assert.equal(getContextValue('correlationId'), 'outer');
  });

  await assert.rejects(() =>
    runWithContext({ correlationId: 'failed' }, () => Promise.reject(new Error('expected failure'))),
  );
  assert.equal(getContext(), undefined);
});

void test('context outside a scoped run is undefined', () => {
  assert.equal(getContext(), undefined);
});
