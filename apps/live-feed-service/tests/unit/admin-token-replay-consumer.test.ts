import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  AdminTokenReplayConsumeResult,
  AdminTokenReplayConsumer,
} from '../../src/application/ports/admin-token-replay-consumer.js';

class InMemoryAdminTokenReplayConsumer implements AdminTokenReplayConsumer {
  private readonly consumed = new Map<string, Date>();

  public consume(jti: string, expiresAt: Date): Promise<AdminTokenReplayConsumeResult> {
    if (this.consumed.has(jti)) return Promise.resolve({ outcome: 'already_consumed' });

    this.consumed.set(jti, new Date(expiresAt.getTime()));
    return Promise.resolve({ outcome: 'consumed' });
  }

  public expiryFor(jti: string): Date | undefined {
    return this.consumed.get(jti);
  }
}

void test('first consumption succeeds', async () => {
  const consumer = new InMemoryAdminTokenReplayConsumer();

  assert.deepEqual(await consumer.consume('jti-1', new Date('2030-01-01T00:00:00.000Z')), {
    outcome: 'consumed',
  });
});

void test('second consumption of the same JTI reports a replay', async () => {
  const consumer = new InMemoryAdminTokenReplayConsumer();
  const expiresAt = new Date('2030-01-01T00:00:00.000Z');

  await consumer.consume('jti-1', expiresAt);

  assert.deepEqual(await consumer.consume('jti-1', expiresAt), {
    outcome: 'already_consumed',
  });
});

void test('different JTIs are independently consumable', async () => {
  const consumer = new InMemoryAdminTokenReplayConsumer();
  const expiresAt = new Date('2030-01-01T00:00:00.000Z');

  assert.deepEqual(await consumer.consume('jti-1', expiresAt), { outcome: 'consumed' });
  assert.deepEqual(await consumer.consume('jti-2', expiresAt), { outcome: 'consumed' });
});

void test('preserves the token expiration metadata for replay state', async () => {
  const consumer = new InMemoryAdminTokenReplayConsumer();
  const expiresAt = new Date('2030-01-01T00:00:00.000Z');

  await consumer.consume('jti-1', expiresAt);

  assert.deepEqual(consumer.expiryFor('jti-1'), expiresAt);
});
