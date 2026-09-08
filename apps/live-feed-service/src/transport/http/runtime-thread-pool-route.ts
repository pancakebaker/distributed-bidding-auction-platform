/**
 * Express route adapter for the read-only libuv thread-pool diagnostic.
 */
import type { Express } from 'express';
import { runLibuvThreadPoolDiagnostic } from '../../infrastructure/runtime/libuv-thread-pool-diagnostic.js';

/**
 * Registers the bounded libuv thread-pool diagnostic endpoint.
 */
export function registerRuntimeThreadPoolRoute(app: Express): void {
  app.get('/diagnostics/runtime/thread-pool', (_request, response, next) => {
    const controller = new AbortController();
    const abortOnDisconnect = () => {
      if (!response.writableEnded) {
        controller.abort();
      }
    };

    response.once('close', abortOnDisconnect);
    void runLibuvThreadPoolDiagnostic({ signal: controller.signal })
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
