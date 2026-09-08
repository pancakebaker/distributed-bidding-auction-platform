/**
 * Tests for process signal and fatal-error lifecycle policy.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { ProcessLifecycle, type ProcessLifecycleEvent } from '../../src/infrastructure/runtime/process-lifecycle.js';

class FakeProcessEvents {
  private readonly listeners = new Map<ProcessLifecycleEvent, Set<(...args: unknown[]) => void>>();

  public on(event: ProcessLifecycleEvent, listener: (...args: unknown[]) => void): this {
    const eventListeners = this.listeners.get(event) ?? new Set();
    eventListeners.add(listener);
    this.listeners.set(event, eventListeners);
    return this;
  }

  public off(event: ProcessLifecycleEvent, listener: (...args: unknown[]) => void): this {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  public async emit(event: ProcessLifecycleEvent, ...args: unknown[]): Promise<void> {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(...args);
    }

    await Promise.resolve();
  }
}

void test('signals initiate one ordinary shutdown and unregister removes handlers', async () => {
  const events = new FakeProcessEvents();
  const reasons: string[] = [];
  const lifecycle = new ProcessLifecycle(
    (reason) => Promise.resolve(reasons.push(reason)),
    events,
    () => undefined,
  );

  lifecycle.register();
  lifecycle.register();
  await Promise.all([events.emit('SIGTERM'), events.emit('SIGINT')]);

  assert.deepEqual(reasons, ['SIGTERM']);
  lifecycle.unregister();
  await events.emit('SIGTERM');
  assert.deepEqual(reasons, ['SIGTERM']);
});

void test('fatal process errors set failure exit intent and share shutdown', async () => {
  const events = new FakeProcessEvents();
  const reasons: string[] = [];
  const exitCodes: number[] = [];
  const lifecycle = new ProcessLifecycle(
    (reason) => Promise.resolve(reasons.push(reason)),
    events,
    (code) => exitCodes.push(code),
  );

  lifecycle.register();
  await Promise.all([
    events.emit('unhandledRejection', new Error('rejected')),
    events.emit('uncaughtException', new Error('uncaught')),
  ]);

  assert.deepEqual(reasons, ['fatal-process-error']);
  assert.deepEqual(exitCodes, [1, 1]);
  lifecycle.unregister();
});
