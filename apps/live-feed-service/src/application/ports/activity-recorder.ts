/**
 * Application port for best-effort operational activity observation.
 */
import type { OperationalActivity } from '../diagnostics/recent-activity-store.js';

/**
 * Records safe metadata about one downstream live-feed processing outcome.
 */
export interface ActivityRecorder {
  /**
   * Records one activity item without changing event-processing correctness.
   */
  record(activity: OperationalActivity): void;
}
