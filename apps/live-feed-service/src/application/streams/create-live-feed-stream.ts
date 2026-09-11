/**
 * Creates the bounded, read-only records exposed by the live-feed diagnostics stream.
 */

/**
 * A single diagnostic record emitted by the bounded live-feed stream.
 */
export type LiveFeedStreamRecord = {
  type: 'runtime' | 'memory' | 'event-loop';
  [key: string]: unknown;
};

/**
 * Snapshot values needed to produce the diagnostic stream without exposing infrastructure types.
 */
export type LiveFeedStreamSnapshot = {
  nodeVersion: string;
  uptimeSeconds: number;
  memory: Record<string, number>;
  eventLoop: Record<string, unknown>;
};

/**
 * Converts one existing runtime snapshot into a small iterable of line-oriented records.
 */
export function createLiveFeedStreamRecords(
  snapshot: LiveFeedStreamSnapshot,
): LiveFeedStreamRecord[] {
  return [
    {
      type: 'runtime',
      nodeVersion: snapshot.nodeVersion,
      uptimeSeconds: snapshot.uptimeSeconds,
    },
    {
      type: 'memory',
      ...snapshot.memory,
    },
    {
      type: 'event-loop',
      ...snapshot.eventLoop,
    },
  ];
}
