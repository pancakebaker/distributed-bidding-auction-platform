/**
 * Express route adapter for the read-only Worker Thread activity diagnostic.
 */
import type { Express } from 'express';
import type { ActivityInput } from '../../application/activity/calculate-auction-activity.js';
import type { ActivityCalculator } from '../../application/ports/activity-calculator.js';
import { requireAdminAuthorization } from './admin/admin-security.js';

/**
 * Registers the bounded CPU diagnostic endpoint with request-local cancellation.
 */
export function registerLiveFeedActivityRoute(
  app: Express,
  calculator: ActivityCalculator,
  createInput: () => ActivityInput,
  isAuthorized: (cookieHeader: string | undefined) => boolean = () => true,
): void {
  app.get('/diagnostics/live-feed/activity', async (request, response, next) => {
    if (!requireAdminAuthorization(response, request.get('cookie'), isAuthorized)) return;
    const controller = new AbortController();
    const abortOnDisconnect = () => {
      if (!response.writableEnded) {
        controller.abort();
      }
    };

    response.once('close', abortOnDisconnect);

    try {
      const result = await calculator.calculate(createInput(), { signal: controller.signal });
      if (!controller.signal.aborted && !response.writableEnded) {
        response.json({ ...result, worker: { used: true } });
      }
    } catch (error) {
      if (!controller.signal.aborted && !response.headersSent) {
        next(error);
      }
    } finally {
      response.off('close', abortOnDisconnect);
    }
  });
}
