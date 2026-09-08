/**
 * Express route adapter for the bounded, read-only live-feed diagnostics stream.
 */
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Express, Response } from 'express';
import { createNdjsonTransform } from '../../infrastructure/streams/ndjson-transform.js';
import type { LiveFeedStreamRecord } from '../../application/streams/create-live-feed-stream.js';

const sourceHighWaterMark = 1;

/**
 * Registers the read-only NDJSON diagnostics endpoint without exposing application or infrastructure types.
 */
export function registerLiveFeedStreamRoute(app: Express, createRecords: () => Iterable<LiveFeedStreamRecord>): void {
  app.get('/diagnostics/live-feed/stream', (_request, response, next) => {
    const controller = new AbortController();
    const abortOnDisconnect = () => {
      if (!response.writableEnded) {
        controller.abort();
      }
    };

    response.once('close', abortOnDisconnect);
    response.type('application/x-ndjson; charset=utf-8');

    void streamRecords(response, createRecords, controller.signal)
      .catch((error: unknown) => {
        if (controller.signal.aborted || response.headersSent) {
          response.destroy();
          return;
        }

        next(error);
      })
      .finally(() => response.off('close', abortOnDisconnect));
  });
}

async function streamRecords(
  response: Response,
  createRecords: () => Iterable<LiveFeedStreamRecord>,
  signal: AbortSignal,
): Promise<void> {
  const source = Readable.from(createRecords(), {
    objectMode: true,
    highWaterMark: sourceHighWaterMark,
  });

  await pipeline(source, createNdjsonTransform(), response, { signal });
}
