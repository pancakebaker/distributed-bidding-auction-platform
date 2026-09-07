/**
 * Isolated Node.js event-loop delay and utilization diagnostics for the live-feed service.
 */
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import type { IntervalHistogram } from 'node:perf_hooks';

/**
 * Normalized event-loop delay percentiles and bounds, expressed in milliseconds.
 */
export type EventLoopDelayMetrics = {
  min: number;
  max: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
};

/**
 * Point-in-time event-loop utilization and delay diagnostics.
 */
export type EventLoopMetrics = {
  utilization: number;
  delayMs: EventLoopDelayMetrics;
};

const EMPTY_DELAY: EventLoopDelayMetrics = {
  min: 0,
  max: 0,
  mean: 0,
  p50: 0,
  p95: 0,
  p99: 0,
};

/**
 * Controls event-loop monitoring without creating import-time timers or global state.
 */
export class EventLoopMonitor {
  private readonly resolution: number;
  private histogram: IntervalHistogram | null = null;
  private baseline: ReturnType<typeof performance.eventLoopUtilization> | null = null;

  public constructor(resolution = 20) {
    if (!Number.isInteger(resolution) || resolution <= 0) {
      throw new Error('Event-loop monitor resolution must be a positive integer.');
    }

    this.resolution = resolution;
  }

  /**
   * Starts collecting event-loop delay and utilization samples.
   */
  public start(): void {
    if (this.histogram) {
      return;
    }

    this.histogram = monitorEventLoopDelay({ resolution: this.resolution });
    this.histogram.enable();
    this.baseline = performance.eventLoopUtilization();
  }

  /**
   * Returns the current normalized event-loop diagnostics without logging or polling.
   */
  public snapshot(): EventLoopMetrics {
    if (!this.histogram || !this.baseline) {
      return { utilization: 0, delayMs: { ...EMPTY_DELAY } };
    }

    const utilization = performance.eventLoopUtilization(this.baseline).utilization;
    const delayMs =
      this.histogram.count === 0
        ? { ...EMPTY_DELAY }
        : {
            min: toMilliseconds(this.histogram.min),
            max: toMilliseconds(this.histogram.max),
            mean: toMilliseconds(this.histogram.mean),
            p50: toMilliseconds(this.histogram.percentile(50)),
            p95: toMilliseconds(this.histogram.percentile(95)),
            p99: toMilliseconds(this.histogram.percentile(99)),
          };

    return {
      utilization: Number.isFinite(utilization) ? Math.max(0, Math.min(1, utilization)) : 0,
      delayMs,
    };
  }

  /**
   * Stops collection and releases the monitor's histogram reference.
   */
  public stop(): void {
    this.histogram?.disable();
    this.histogram = null;
    this.baseline = null;
  }
}

function toMilliseconds(nanoseconds: number): number {
  return Number.isFinite(nanoseconds) && nanoseconds >= 0 ? nanoseconds / 1_000_000 : 0;
}
