/**
 * Testable process signal and fatal-error lifecycle management for the live-feed service.
 */

/**
 * Process events handled by the live-feed lifecycle manager.
 */
export type ProcessLifecycleEvent =
  'SIGTERM' | 'SIGINT' | 'unhandledRejection' | 'uncaughtException';

/**
 * Reasons that can initiate a service shutdown.
 */
export type ShutdownReason = 'SIGTERM' | 'SIGINT' | 'fatal-process-error' | 'startup-failure';

/**
 * Minimal process event surface used to keep lifecycle registration testable.
 */
export type ProcessEventSource = {
  on: (event: ProcessLifecycleEvent, listener: (...args: unknown[]) => void) => ProcessEventSource;
  off: (event: ProcessLifecycleEvent, listener: (...args: unknown[]) => void) => ProcessEventSource;
};

/**
 * Coordinates signals and fatal process errors through one idempotent shutdown callback.
 */
export class ProcessLifecycle {
  private readonly shutdownHandler: (reason: ShutdownReason) => Promise<void>;
  private readonly processEvents: ProcessEventSource;
  private readonly setExitCode: (code: number) => void;
  private shutdownPromise: Promise<void> | null = null;
  private registered = false;

  public constructor(
    shutdownHandler: (reason: ShutdownReason) => Promise<void>,
    processEvents: ProcessEventSource,
    setExitCode: (code: number) => void,
  ) {
    this.shutdownHandler = shutdownHandler;
    this.processEvents = processEvents;
    this.setExitCode = setExitCode;
  }

  /**
   * Registers signal and fatal-process handlers once.
   */
  public register(): void {
    if (this.registered) {
      return;
    }

    this.registered = true;
    this.processEvents.on('SIGTERM', this.onSignal);
    this.processEvents.on('SIGINT', this.onSignal);
    this.processEvents.on('unhandledRejection', this.onFatal);
    this.processEvents.on('uncaughtException', this.onFatal);
  }

  /**
   * Removes lifecycle handlers, primarily for isolated tests.
   */
  public unregister(): void {
    if (!this.registered) {
      return;
    }

    this.processEvents.off('SIGTERM', this.onSignal);
    this.processEvents.off('SIGINT', this.onSignal);
    this.processEvents.off('unhandledRejection', this.onFatal);
    this.processEvents.off('uncaughtException', this.onFatal);
    this.registered = false;
  }

  /**
   * Starts shutdown once and shares the same completion promise with later callers.
   */
  public shutdown(reason: ShutdownReason, fatal = false): Promise<void> {
    if (fatal) {
      this.setExitCode(1);
    }

    if (!this.shutdownPromise) {
      this.shutdownPromise = this.shutdownHandler(reason);
    }

    return this.shutdownPromise;
  }

  private readonly onSignal = (signal: unknown): void => {
    void this.requestShutdown(signal === 'SIGINT' ? 'SIGINT' : 'SIGTERM', false);
  };

  private readonly onFatal = (error: unknown): void => {
    const errorType = error instanceof Error ? error.name : typeof error;
    console.error(`Fatal process error (${errorType}); graceful shutdown requested.`);
    void this.requestShutdown('fatal-process-error', true);
  };

  private async requestShutdown(reason: ShutdownReason, fatal: boolean): Promise<void> {
    try {
      await this.shutdown(reason, fatal);
    } catch (error) {
      this.setExitCode(1);
      console.error(
        'Graceful shutdown failed.',
        error instanceof Error ? error.name : typeof error,
      );
    }
  }
}
