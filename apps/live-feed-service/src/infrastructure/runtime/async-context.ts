/**
 * AsyncLocalStorage-backed request and event metadata for observational live-feed diagnostics.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Metadata associated with one asynchronous HTTP request or RabbitMQ delivery.
 */
export type AsyncContext = {
  requestId?: string;
  correlationId?: string;
  eventId?: string;
  auctionId?: string;
};

const asyncContextStorage = new AsyncLocalStorage<AsyncContext>();

/**
 * Runs a callback inside an isolated asynchronous context.
 */
export function runWithContext<T>(context: AsyncContext, callback: () => T): T {
  return asyncContextStorage.run({ ...context }, callback);
}

/**
 * Returns the current request or event context, when execution is inside one.
 */
export function getContext(): AsyncContext | undefined {
  return asyncContextStorage.getStore();
}

/**
 * Returns one current context field without exposing the underlying storage.
 */
export function getContextValue<TKey extends keyof AsyncContext>(key: TKey): AsyncContext[TKey] | undefined {
  return getContext()?.[key];
}
