/**
 * Tests for the pure bounded activity calculation.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateAuctionActivity } from '../../src/application/activity/calculate-auction-activity.js';

void test('activity calculation is deterministic and returns histogram percentiles', () => {
  const input = { samples: [1, 2, 3, 4], bucketCount: 2, iterations: 2 };
  const first = calculateAuctionActivity(input);
  const second = calculateAuctionActivity(input);

  assert.deepEqual(first, second);
  assert.equal(first.sampleCount, 4);
  assert.deepEqual(first.histogram, [2, 2]);
  assert.deepEqual(first.percentiles, { p50: 2, p95: 4, p99: 4 });
  assert.ok(first.checksum >= 0);
});

void test('empty activity input returns empty histogram and zero percentiles', () => {
  const result = calculateAuctionActivity({ samples: [], bucketCount: 3, iterations: 1 });

  assert.deepEqual(result, {
    sampleCount: 0,
    histogram: [0, 0, 0],
    percentiles: { p50: 0, p95: 0, p99: 0 },
    checksum: 0,
  });
});

void test('invalid activity values are rejected before calculation', () => {
  assert.throws(
    () => calculateAuctionActivity({ samples: [Number.NaN], iterations: 1 }),
    /finite and bounded/,
  );
  assert.throws(
    () => calculateAuctionActivity({ samples: [1], bucketCount: 0, iterations: 1 }),
    /bucket count/,
  );
});
