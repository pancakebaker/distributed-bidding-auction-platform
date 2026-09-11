/**
 * Tests for Worker Thread activity calculation, messaging, responsiveness, timeout, and cancellation.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateAuctionActivity } from '../../src/application/activity/calculate-auction-activity.js';
import type { ActivityInput } from '../../src/application/activity/calculate-auction-activity.js';
import { ApplicationError } from '../../src/application/errors/application-error.js';
import { WorkerActivityCalculator } from '../../src/infrastructure/workers/worker-activity-calculator.js';

const smallInput: ActivityInput = { samples: [2, 4, 8], bucketCount: 3, iterations: 2 };

void test('worker result matches the pure calculation through structured cloning', async () => {
  const calculator = new WorkerActivityCalculator();

  try {
    const [direct, worker] = await Promise.all([
      Promise.resolve(calculateAuctionActivity(smallInput)),
      calculator.calculate(smallInput),
    ]);

    assert.deepEqual(worker, direct);
    assert.equal(calculator.activeWorkerCount(), 0);
  } finally {
    await calculator.close();
  }
});

void test('worker calculation leaves the main thread available for a timer turn', async () => {
  const calculator = new WorkerActivityCalculator();
  let mainThreadTurnCompleted = false;

  try {
    const workerResult = calculator.calculate({ samples: [1, 2, 3, 4], iterations: 2_000_000 });
    const mainThreadTurn = new Promise<void>((resolve) => {
      setImmediate(() => {
        mainThreadTurnCompleted = true;
        resolve();
      });
    });

    await mainThreadTurn;
    await workerResult;
    assert.equal(mainThreadTurnCompleted, true);
  } finally {
    await calculator.close();
  }
});

void test('worker failures reject safely and clean up the worker', async () => {
  const calculator = new WorkerActivityCalculator();

  try {
    await assert.rejects(
      calculator.calculate({ samples: [Number.NaN], iterations: 1 }),
      (error: unknown) =>
        error instanceof ApplicationError && error.code === 'activity_worker_failed',
    );
    assert.equal(calculator.activeWorkerCount(), 0);
  } finally {
    await calculator.close();
  }
});

void test('worker timeout terminates only the timed-out invocation', async () => {
  const calculator = new WorkerActivityCalculator();

  try {
    await assert.rejects(
      calculator.calculate({ samples: [1, 2, 3], iterations: 20_000_000 }, { timeoutMs: 1 }),
      (error: unknown) => error instanceof ApplicationError && error.code === 'activity_timeout',
    );
    assert.equal(calculator.activeWorkerCount(), 0);
  } finally {
    await calculator.close();
  }
});

void test('aborting a worker calculation terminates the request-local worker', async () => {
  const calculator = new WorkerActivityCalculator();
  const controller = new AbortController();

  try {
    const operation = calculator.calculate(
      { samples: [1, 2, 3], iterations: 20_000_000 },
      { signal: controller.signal },
    );
    controller.abort();

    await assert.rejects(
      operation,
      (error: unknown) => error instanceof ApplicationError && error.code === 'activity_cancelled',
    );
    assert.equal(calculator.activeWorkerCount(), 0);
  } finally {
    await calculator.close();
  }
});
void test('close terminates active worker invocations for shutdown', async () => {
  const calculator = new WorkerActivityCalculator();
  const operation = calculator.calculate({ samples: [1, 2, 3], iterations: 20_000_000 });
  const expectedRejection = assert.rejects(operation, { name: 'ApplicationError' });

  await new Promise<void>((resolve) => setImmediate(resolve));
  await calculator.close();

  await expectedRejection;
  assert.equal(calculator.activeWorkerCount(), 0);
});
