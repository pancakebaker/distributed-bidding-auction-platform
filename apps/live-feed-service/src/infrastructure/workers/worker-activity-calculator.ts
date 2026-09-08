/**
 * Worker Thread adapter for bounded live-feed diagnostic CPU calculations.
 */
import { Worker } from 'node:worker_threads';
import { ApplicationError } from '../../application/errors/application-error.js';
import type { ActivityCalculator, ActivityCalculationOptions } from '../../application/ports/activity-calculator.js';
import type { ActivityInput, ActivityResult } from '../../application/activity/calculate-auction-activity.js';

/**
 * Default maximum duration for one diagnostic worker invocation.
 */
export const defaultActivityTimeoutMs = 2_000;

/**
 * Runs one worker per calculation and tracks them for bounded shutdown cleanup.
 */
export class WorkerActivityCalculator implements ActivityCalculator {
  private readonly activeWorkers = new Set<Worker>();
  private readonly activeRejectors = new Map<Worker, (error: Error) => void>();

  /**
   * Runs the pure activity calculation in a Worker Thread.
   */
  public calculate(input: ActivityInput, options: ActivityCalculationOptions = {}): Promise<ActivityResult> {
    const workerFile = import.meta.url.endsWith('.ts') ? 'activity.worker.ts' : 'activity.worker.js';
    const worker = new Worker(new URL(`./${workerFile}`, import.meta.url), {
      workerData: input,
      execArgv: workerExecArgv(),
    });
    this.activeWorkers.add(worker);

    return new Promise<ActivityResult>((resolve, reject) => {
      let settled = false;
      const timeoutMs = options.timeoutMs ?? defaultActivityTimeoutMs;
      const timer = setTimeout(() => {
        settleReject(new ApplicationError('Activity calculation timed out.', 504, 'activity_timeout'));
      }, timeoutMs);

      const abort = () => {
        settleReject(new ApplicationError('Activity calculation was cancelled.', 499, 'activity_cancelled'));
      };

      options.signal?.addEventListener('abort', abort, { once: true });

      const cleanup = () => {
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', abort);
        this.activeWorkers.delete(worker);
        this.activeRejectors.delete(worker);
      };

      const terminate = () => {
        void worker.terminate().catch(() => undefined);
      };

      const settleResolve = (result: ActivityResult) => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        terminate();
        resolve(result);
      };

      const settleReject = (error: Error) => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        terminate();
        reject(error);
      };

      this.activeRejectors.set(worker, settleReject);
      worker.once('message', (result: ActivityResult) => settleResolve(result));
      worker.once('error', (error: Error) =>
        settleReject(new ApplicationError('Activity worker failed.', 500, 'activity_worker_failed', { cause: error })),
      );
      worker.once('exit', (code) => {
        if (code !== 0 && !settled) {
          settleReject(new ApplicationError('Activity worker exited unexpectedly.', 500, 'activity_worker_failed'));
        }
      });
    });
  }

  /**
   * Terminates active diagnostic workers during service shutdown.
   */
  public async close(): Promise<void> {
    const workers = [...this.activeWorkers];
    for (const worker of workers) {
      this.activeRejectors.get(worker)?.(
        new ApplicationError('Activity worker was terminated during shutdown.', 503, 'activity_worker_shutdown'),
      );
    }

    await Promise.all(workers.map((worker) => worker.terminate()));
  }

  /**
   * Returns the number of active worker invocations for focused lifecycle tests.
   */
  public activeWorkerCount(): number {
    return this.activeWorkers.size;
  }
}

function workerExecArgv(): string[] {
  const acceptedFlags = new Set(['--import', '--loader', '--require']);
  const args: string[] = [];

  for (let index = 0; index < process.execArgv.length; index += 1) {
    const argument = process.execArgv[index];
    if (!argument) {
      continue;
    }

    if (acceptedFlags.has(argument)) {
      args.push(argument);
      const value = process.execArgv[index + 1];
      if (value) {
        args.push(value);
        index += 1;
      }
      continue;
    }

    if (argument.startsWith('--import=') || argument.startsWith('--loader=')) {
      args.push(argument);
    }
  }

  return args;
}
