/**
 * Read-only Node.js process identity and memory diagnostics for the live-feed service.
 */

/**
 * Process memory categories returned as raw byte counts.
 */
export type ProcessMemoryMetrics = {
  rss: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
  arrayBuffers: number;
};

/**
 * Lightweight process runtime metrics that exclude environment variables and secrets.
 */
export type ProcessMetrics = {
  pid: number;
  nodeVersion: string;
  uptimeSeconds: number;
  memory: ProcessMemoryMetrics;
};

/**
 * Captures current process identity, uptime, and V8/process memory categories.
 */
export function getProcessMetrics(): ProcessMetrics {
  const memory = process.memoryUsage();

  return {
    pid: process.pid,
    nodeVersion: process.version,
    uptimeSeconds: process.uptime(),
    memory: {
      rss: memory.rss,
      heapTotal: memory.heapTotal,
      heapUsed: memory.heapUsed,
      external: memory.external,
      arrayBuffers: memory.arrayBuffers,
    },
  };
}
