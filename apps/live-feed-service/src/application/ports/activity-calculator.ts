/**
 * Application-facing port for bounded CPU activity calculations.
 */
import type { ActivityInput, ActivityResult } from '../activity/calculate-auction-activity.js';

/**
 * Options controlling cancellation of one activity calculation.
 */
export type ActivityCalculationOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

/**
 * Calculates diagnostic activity without exposing the worker implementation to HTTP code.
 */
export interface ActivityCalculator {
  /**
   * Runs one bounded activity calculation.
   */
  calculate(input: ActivityInput, options?: ActivityCalculationOptions): Promise<ActivityResult>;
}
