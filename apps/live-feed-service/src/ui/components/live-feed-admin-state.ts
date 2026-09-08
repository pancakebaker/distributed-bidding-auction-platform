/**
 * Pure client-side state helper for merging bounded live activity updates into the dashboard snapshot.
 */
import type { OperationalActivity } from '../../application/diagnostics/recent-activity-store.js';

/**
 * Prepends a new activity item, removes an existing item with the same event id, and preserves the dashboard bound.
 *
 * @param current - Current newest-first activity state.
 * @param activity - Newly observed activity item.
 * @param capacity - Maximum number of items to retain.
 */
export function mergeRecentActivity(
  current: readonly OperationalActivity[],
  activity: OperationalActivity,
  capacity = 50,
): OperationalActivity[] {
  return [activity, ...current.filter((item) => item.eventId !== activity.eventId)].slice(0, capacity);
}
