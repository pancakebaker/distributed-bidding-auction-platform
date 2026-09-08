/**
 * Runs a bounded crypto diagnostic that exercises Node's libuv thread pool.
 */
import { pbkdf2 } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { ApplicationError } from '../../application/errors/application-error.js';

const defaultIterations = 10_000;
const defaultKeyLength = 16;
const maxIterations = 200_000;
const maxKeyLength = 64;

/**
 * Options for one fixed-purpose libuv thread-pool diagnostic.
 */
export type LibuvDiagnosticOptions = {
  iterations?: number;
  keyLength?: number;
  signal?: AbortSignal;
};

/**
 * Safe metadata returned by the libuv thread-pool diagnostic.
 */
export type LibuvDiagnosticResult = {
  operation: 'pbkdf2';
  durationMs: number;
  iterations: number;
  keyLength: number;
  threadPoolBacked: true;
};

/**
 * Runs asynchronous PBKDF2 work using Node's native libuv-backed crypto API.
 */
export function runLibuvThreadPoolDiagnostic(options: LibuvDiagnosticOptions = {}): Promise<LibuvDiagnosticResult> {
  const iterations = options.iterations ?? defaultIterations;
  const keyLength = options.keyLength ?? defaultKeyLength;
  try {
    validateOptions(iterations, keyLength);
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error('Thread-pool diagnostic validation failed.'));
  }

  if (options.signal?.aborted) {
    return Promise.reject(new ApplicationError('Thread-pool diagnostic was cancelled.', 499, 'diagnostic_cancelled'));
  }

  const startedAt = performance.now();

  return new Promise((resolve, reject) => {
    pbkdf2('live-feed-diagnostic-input', 'live-feed-diagnostic-salt', iterations, keyLength, 'sha256', (error) => {
      if (error) {
        reject(new ApplicationError('Thread-pool diagnostic failed.', 500, 'diagnostic_failed', { cause: error }));
        return;
      }

      if (options.signal?.aborted) {
        reject(new ApplicationError('Thread-pool diagnostic was cancelled.', 499, 'diagnostic_cancelled'));
        return;
      }

      resolve({
        operation: 'pbkdf2',
        durationMs: Math.max(0, performance.now() - startedAt),
        iterations,
        keyLength,
        threadPoolBacked: true,
      });
    });
  });
}

function validateOptions(iterations: number, keyLength: number): void {
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > maxIterations) {
    throw new ApplicationError(
      'Thread-pool iterations are outside the supported range.',
      400,
      'invalid_diagnostic_options',
    );
  }

  if (!Number.isInteger(keyLength) || keyLength < 1 || keyLength > maxKeyLength) {
    throw new ApplicationError(
      'Thread-pool key length is outside the supported range.',
      400,
      'invalid_diagnostic_options',
    );
  }
}
