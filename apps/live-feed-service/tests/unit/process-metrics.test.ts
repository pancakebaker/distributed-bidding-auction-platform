import assert from 'node:assert/strict';
import test from 'node:test';
import { getProcessMetrics } from '../../src/infrastructure/runtime/process-metrics.js';

void test('process metrics expose safe runtime identity and memory fields', () => {
  const metrics = getProcessMetrics();

  assert.equal(typeof metrics.pid, 'number');
  assert.equal(typeof metrics.nodeVersion, 'string');
  assert.equal(typeof metrics.uptimeSeconds, 'number');
  assert.ok(metrics.uptimeSeconds >= 0);

  for (const value of Object.values(metrics.memory)) {
    assert.equal(typeof value, 'number');
    assert.ok(Number.isFinite(value));
    assert.ok(value >= 0);
  }

  assert.equal('env' in metrics, false);
  assert.equal('RABBITMQ_URL' in metrics, false);
});
