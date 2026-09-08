/**
 * Tests bounded, ISO-validated history filters at the application boundary.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { ApplicationError } from '../../src/application/errors/application-error.js';
import { maxHistoryRangeMs, parseHistoryFilters } from '../../src/application/history/query-live-feed-history.js';

void test('history filters default to a bounded UTC range and limit', () => {
  const now = new Date('2026-01-31T12:00:00.000Z');
  const filters = parseHistoryFilters({}, now);

  assert.equal(filters.to, now.toISOString());
  assert.equal(new Date(filters.to).getTime() - new Date(filters.from).getTime(), 24 * 60 * 60 * 1000);
  assert.equal(filters.limit, 100);
});

void test('history filters accept optional fields and reject ranges over 31 days', () => {
  const filters = parseHistoryFilters(
    {
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-01-02T00:00:00.000Z',
      auctionId: 'auction-1',
      eventType: 'BidAccepted',
      outcome: 'applied',
      limit: '25',
    },
    new Date('2026-02-01T00:00:00.000Z'),
  );

  assert.deepEqual(filters, {
    from: '2026-01-01T00:00:00.000Z',
    to: '2026-01-02T00:00:00.000Z',
    auctionId: 'auction-1',
    eventType: 'BidAccepted',
    outcome: 'applied',
    limit: 25,
  });

  assert.throws(
    () =>
      parseHistoryFilters(
        {
          from: '2026-01-01T00:00:00.000Z',
          to: new Date(new Date('2026-01-01T00:00:00.000Z').getTime() + maxHistoryRangeMs + 1).toISOString(),
        },
        new Date('2026-03-01T00:00:00.000Z'),
      ),
    (error: unknown) => error instanceof ApplicationError && error.code === 'history_range_too_large',
  );
});

void test('history filters reject unsupported outcomes and unsafe limits', () => {
  assert.throws(() => parseHistoryFilters({ outcome: 'pending' }), /outcome filter is invalid/);
  assert.throws(() => parseHistoryFilters({ limit: '0' }), /between 1 and/);
  assert.throws(() => parseHistoryFilters({ eventType: 'x'.repeat(81) }), /eventType filter is invalid/);
});
