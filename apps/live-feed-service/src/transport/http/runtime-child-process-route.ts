/**
 * Express route adapter for the read-only child-process runtime diagnostic.
 */
import type { Express } from 'express';
import { runChildProcessProbe } from '../../infrastructure/runtime/child-process-probe.js';

/**
 * Registers the fixed, safe child-process diagnostic endpoint.
 */
export function registerRuntimeChildProcessRoute(app: Express): void {
  app.get('/diagnostics/runtime/child-process', (_request, response, next) => {
    const controller = new AbortController();
    const abortOnDisconnect = () => {
      if (!response.writableEnded) {
        controller.abort();
      }
    };

    response.once('close', abortOnDisconnect);
    void runChildProcessProbe({ signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted && !response.writableEnded) {
          response.json(result);
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted && !response.headersSent) {
          next(error);
        }
      })
      .finally(() => response.off('close', abortOnDisconnect));
  });
}
