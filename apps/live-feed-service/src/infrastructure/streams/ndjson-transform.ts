/**
 * Transforms diagnostic records into newline-delimited UTF-8 Buffer chunks.
 */
import { Transform } from 'node:stream';
import type { TransformCallback, TransformOptions } from 'node:stream';

/**
 * Options for the diagnostic NDJSON transform.
 */
export type NdjsonTransformOptions = Omit<
  TransformOptions,
  'writableObjectMode' | 'readableObjectMode'
>;

/**
 * Creates an object-mode-to-byte-mode transform for newline-delimited JSON.
 */
export function createNdjsonTransform(options: NdjsonTransformOptions = {}): Transform {
  return new Transform({
    ...options,
    writableObjectMode: true,
    readableObjectMode: false,
    transform(record: unknown, _encoding: BufferEncoding, callback: TransformCallback) {
      try {
        callback(null, Buffer.from(`${JSON.stringify(record)}\n`, 'utf8'));
      } catch (error) {
        callback(error instanceof Error ? error : new Error('Unable to serialize stream record.'));
      }
    },
  });
}
