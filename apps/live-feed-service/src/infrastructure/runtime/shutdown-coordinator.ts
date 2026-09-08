/**
 * Idempotent ordered shutdown coordination for live-feed runtime resources.
 */

/**
 * One named cleanup action in the service shutdown sequence.
 */
export type ShutdownStep = {
  name: string;
  run: () => Promise<void> | void;
};

/**
 * Runs cleanup steps once, in order, while allowing later resources to close after one failure.
 */
export function createShutdownCoordinator(
  steps: readonly ShutdownStep[],
  reportError = reportShutdownError,
): () => Promise<void> {
  let shutdownPromise: Promise<void> | null = null;

  return () => {
    if (!shutdownPromise) {
      shutdownPromise = executeShutdown(steps, reportError);
    }

    return shutdownPromise;
  };
}

async function executeShutdown(
  steps: readonly ShutdownStep[],
  reportError: (step: ShutdownStep, error: unknown) => void,
): Promise<void> {
  for (const step of steps) {
    try {
      await step.run();
    } catch (error) {
      reportError(step, error);
    }
  }
}

function reportShutdownError(step: ShutdownStep, _error: unknown): void {
  console.warn(`Live-feed shutdown step failed: ${step.name}.`);
}
