/**
 * Runs a fixed, safe child-process runtime probe for process-isolation diagnostics.
 */
import { spawn } from 'node:child_process';
import { ApplicationError } from '../../application/errors/application-error.js';

const defaultTimeoutMs = 1_000;
const maxOutputBytes = 16_384;
const childProbeScript =
  'process.stdout.write(JSON.stringify({pid:process.pid,nodeVersion:process.version,platform:process.platform,architecture:process.arch}))';

/**
 * Options controlling one request-local child-process probe.
 */
export type ChildProcessProbeOptions = {
  timeoutMs?: number;
  signal?: AbortSignal;
};

/**
 * Safe runtime identity returned by the isolated child process.
 */
export type ChildProcessProbeResult = {
  isolatedProcess: true;
  pid: number;
  nodeVersion: string;
  platform: string;
  architecture: string;
};

/**
 * Runs the current Node executable with a fixed, non-shell diagnostic script.
 */
export function runChildProcessProbe(
  options: ChildProcessProbeOptions = {},
): Promise<ChildProcessProbeResult> {
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > defaultTimeoutMs) {
    return Promise.reject(
      new ApplicationError(
        'Child-process timeout is outside the supported range.',
        400,
        'invalid_diagnostic_options',
      ),
    );
  }

  if (options.signal?.aborted) {
    return Promise.reject(
      new ApplicationError('Child-process probe was cancelled.', 499, 'diagnostic_cancelled'),
    );
  }

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', childProbeScript], {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      finishReject(
        new ApplicationError('Child-process probe timed out.', 504, 'diagnostic_timeout'),
      );
    }, timeoutMs);

    const abort = () => {
      finishReject(
        new ApplicationError('Child-process probe was cancelled.', 499, 'diagnostic_cancelled'),
      );
    };

    options.signal?.addEventListener('abort', abort, { once: true });

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
      if (Buffer.byteLength(stdout, 'utf8') > maxOutputBytes) {
        finishReject(
          new ApplicationError(
            'Child-process probe output was too large.',
            500,
            'diagnostic_failed',
          ),
        );
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
      if (Buffer.byteLength(stderr, 'utf8') > maxOutputBytes) {
        finishReject(
          new ApplicationError(
            'Child-process probe output was too large.',
            500,
            'diagnostic_failed',
          ),
        );
      }
    });
    child.once('error', (error: Error) => {
      finishReject(
        new ApplicationError('Child-process probe failed.', 500, 'diagnostic_failed', {
          cause: error,
        }),
      );
    });
    child.once('close', (code) => {
      if (settled) {
        return;
      }

      if (code !== 0) {
        finishReject(
          new ApplicationError(
            'Child-process probe exited unexpectedly.',
            500,
            'diagnostic_failed',
          ),
        );
        return;
      }

      try {
        resolve(parseChildProbeOutput(stdout, process.pid));
        finishResolve();
      } catch (error) {
        finishReject(
          error instanceof ApplicationError
            ? error
            : new ApplicationError(
                'Child-process probe returned invalid output.',
                500,
                'diagnostic_failed',
              ),
        );
      }
    });

    function finishResolve(): void {
      settled = true;
      cleanup();
    }

    function finishReject(error: ApplicationError): void {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      child.kill();
      reject(error);
    }

    function cleanup(): void {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
    }
  });
}

/**
 * Validates the bounded JSON output from the fixed child probe.
 */
export function parseChildProbeOutput(stdout: string, parentPid: number): ChildProcessProbeResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    throw new ApplicationError(
      'Child-process probe returned invalid output.',
      500,
      'diagnostic_failed',
      {
        cause: error,
      },
    );
  }

  if (!isRecord(parsed)) {
    throw new ApplicationError(
      'Child-process probe returned invalid output.',
      500,
      'diagnostic_failed',
    );
  }

  const pid = parsed.pid;
  const nodeVersion = parsed.nodeVersion;
  const platform = parsed.platform;
  const architecture = parsed.architecture;

  if (typeof pid !== 'number' || pid === parentPid || !Number.isInteger(pid)) {
    throw new ApplicationError(
      'Child-process probe returned invalid output.',
      500,
      'diagnostic_failed',
    );
  }

  if (
    typeof nodeVersion !== 'string' ||
    typeof platform !== 'string' ||
    typeof architecture !== 'string'
  ) {
    throw new ApplicationError(
      'Child-process probe returned invalid output.',
      500,
      'diagnostic_failed',
    );
  }

  return {
    isolatedProcess: true,
    pid,
    nodeVersion,
    platform,
    architecture,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
