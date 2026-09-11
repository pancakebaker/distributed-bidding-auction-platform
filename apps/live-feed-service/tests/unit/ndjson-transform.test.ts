/**
 * Tests for NDJSON transformation, Buffer output, backpressure, cancellation, and errors.
 */
import assert from 'node:assert/strict';
import { pipeline } from 'node:stream/promises';
import { Readable, Writable } from 'node:stream';
import test from 'node:test';
import { createNdjsonTransform } from '../../src/infrastructure/streams/ndjson-transform.js';

function collectingWritable(
  chunks: Buffer[],
  options: ConstructorParameters<typeof Writable>[0] = {},
) {
  return new Writable({
    ...options,
    write(chunk: Uint8Array, _encoding: BufferEncoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    },
  });
}

void test('NDJSON transform emits one newline-terminated Buffer per record', async () => {
  const chunks: Buffer[] = [];
  await pipeline(
    Readable.from([{ id: 1 }, { id: 2 }], { objectMode: true }),
    createNdjsonTransform(),
    collectingWritable(chunks),
  );

  assert.equal(chunks.length, 2);
  assert.equal(Buffer.isBuffer(chunks[0]), true);
  assert.equal(chunks[0] instanceof Uint8Array, true);
  assert.deepEqual(
    chunks.map((chunk) => chunk.toString('utf8')),
    ['{"id":1}\n', '{"id":2}\n'],
  );
});

void test('pipeline preserves order while a small-buffer writable applies backpressure', async () => {
  const chunks: Buffer[] = [];
  const slowWritable = collectingWritable(chunks, { highWaterMark: 1 });
  const records = Array.from({ length: 8 }, (_, id) => ({ id }));

  await pipeline(
    Readable.from(records, { objectMode: true, highWaterMark: 1 }),
    createNdjsonTransform(),
    slowWritable,
  );

  assert.deepEqual(
    chunks.map((chunk) => JSON.parse(chunk.toString('utf8')) as { id: number }),
    records,
  );
});

void test('serialization errors propagate through pipeline', async () => {
  await assert.rejects(
    pipeline(
      Readable.from([{ value: BigInt(1) }], { objectMode: true }),
      createNdjsonTransform(),
      collectingWritable([]),
    ),
    TypeError,
  );
});

void test('aborting pipeline tears down an async source', async () => {
  const controller = new AbortController();
  let cleanedUp = false;
  let releaseSource!: () => void;
  const sourcePaused = new Promise<void>((resolve) => {
    releaseSource = resolve;
  });

  async function* records() {
    try {
      yield { id: 1 };
      await sourcePaused;
    } finally {
      cleanedUp = true;
    }
  }

  const running = pipeline(
    Readable.from(records(), { objectMode: true }),
    createNdjsonTransform(),
    new Writable({ write: () => undefined }),
    { signal: controller.signal },
  );

  await new Promise<void>((resolve) => setImmediate(resolve));
  controller.abort();
  releaseSource();

  await assert.rejects(running, { name: 'AbortError' });
  assert.equal(cleanedUp, true);
});
