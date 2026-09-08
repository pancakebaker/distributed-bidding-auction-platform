/**
 * Startup orchestration that cleans up resources when initialization fails.
 */

/**
 * Runs startup work and invokes cleanup before rethrowing a startup failure.
 *
 * @param start - Startup work that may allocate runtime resources.
 * @param cleanup - Cleanup for resources allocated before startup failed.
 * @returns The successful startup result.
 */
export async function runWithStartupCleanup<TResult>(
  start: () => Promise<TResult>,
  cleanup: () => Promise<void>,
): Promise<TResult> {
  try {
    return await start();
  } catch (error) {
    await cleanup();
    throw error;
  }
}
