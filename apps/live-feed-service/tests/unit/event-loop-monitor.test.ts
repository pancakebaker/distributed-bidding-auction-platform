import assert from 'node:assert/strict';
import test from 'node:test';
import { EventLoopMonitor } from '../../src/infrastructure/runtime/event-loop-monitor.js';

void test('event-loop monitor starts, snapshots finite values, and stops cleanly', () => {
  const monitor = new EventLoopMonitor(10);

  assert.deepEqual(monitor.snapshot(), {
    utilization: 0,
    delayMs: { min: 0, max: 0, mean: 0, p50: 0, p95: 0, p99: 0 },
  });

  monitor.start();
  const snapshot = monitor.snapshot();

  assert.ok(Number.isFinite(snapshot.utilization));
  assert.ok(snapshot.utilization >= 0);
  for (const value of Object.values(snapshot.delayMs)) {
    assert.ok(Number.isFinite(value));
    assert.ok(value >= 0);
  }

  monitor.stop();
  assert.deepEqual(monitor.snapshot(), {
    utilization: 0,
    delayMs: { min: 0, max: 0, mean: 0, p50: 0, p95: 0, p99: 0 },
  });
});
