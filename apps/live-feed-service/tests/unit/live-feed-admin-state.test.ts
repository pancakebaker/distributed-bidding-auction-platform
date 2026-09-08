/**
 * Tests the pure live-admin activity state merge behavior.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeRecentActivity } from '../../src/ui/components/live-feed-admin-state.js';
import type { OperationalActivity } from '../../src/application/diagnostics/recent-activity-store.js';

function activity(eventId: string): OperationalActivity {
  return {
    eventId,
    eventType: 'BidAccepted',
    auctionId: 'auction-1',
    receivedAt: '2026-01-01T00:00:00.000Z',
    outcome: 'applied',
  };
}

void test('new activity is prepended, deduplicated, and bounded at fifty items', () => {
  const current = Array.from({ length: 50 }, (_, index) => activity(`event-${index}`));
  const next = mergeRecentActivity(current, activity('event-new'));

  assert.equal(next.length, 50);
  assert.equal(next[0]?.eventId, 'event-new');
  assert.equal(
    next.some((item) => item.eventId === 'event-49'),
    false,
  );
});

void test('repeated activity replaces its previous position without mutating state', () => {
  const current = [activity('older'), activity('existing')];
  const next = mergeRecentActivity(current, activity('existing'));

  assert.deepEqual(
    next.map((item) => item.eventId),
    ['existing', 'older'],
  );
  assert.deepEqual(
    current.map((item) => item.eventId),
    ['older', 'existing'],
  );
});
