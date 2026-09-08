/**
 * Validation and application query boundary for bounded admin live-feed history.
 */
import { ApplicationError } from '../errors/application-error.js';
import type { LiveFeedHistoryFilters } from './live-feed-history-types.js';
import type { LiveFeedHistoryStore } from '../ports/live-feed-history-store.js';

/** Maximum time range accepted by admin history queries. */
export const maxHistoryRangeMs = 31 * 24 * 60 * 60 * 1000;
/** Default time range used when an admin does not supply both boundaries. */
export const defaultHistoryRangeMs = 24 * 60 * 60 * 1000;
/** Default interactive history result limit. */
export const defaultHistoryLimit = 100;
/** Maximum interactive history result limit. */
export const maxHistoryLimit = 500;
/** Maximum PDF result limit. */
export const maxHistoryExportLimit = 2000;

/**
 * Raw query values accepted by the HTTP adapter.
 */
export type HistoryQueryInput = Record<string, unknown>;

/**
 * Parses ISO date filters and rejects unsafe or unbounded admin requests.
 */
export function parseHistoryFilters(
  input: HistoryQueryInput,
  now = new Date(),
  exportRequest = false,
): LiveFeedHistoryFilters {
  const currentTime = now.getTime();
  const from = parseDate(input.from, 'from');
  const to = parseDate(input.to, 'to');
  const normalizedTo = to ?? now;
  const normalizedFrom = from ?? new Date(normalizedTo.getTime() - defaultHistoryRangeMs);

  if (normalizedFrom.getTime() > normalizedTo.getTime()) {
    throw new ApplicationError('The history from time must not be after the to time.', 400, 'invalid_history_range');
  }

  if (normalizedTo.getTime() > currentTime + 5 * 60 * 1000) {
    throw new ApplicationError('The history to time must not be far in the future.', 400, 'invalid_history_range');
  }

  if (normalizedTo.getTime() - normalizedFrom.getTime() > maxHistoryRangeMs) {
    throw new ApplicationError('History queries are limited to a 31-day range.', 400, 'history_range_too_large');
  }

  const limit = parseLimit(input.limit, exportRequest ? maxHistoryExportLimit : maxHistoryLimit);
  const auctionId = parseOptionalText(input.auctionId, 'auctionId', 120);
  const eventType = parseOptionalText(input.eventType, 'eventType', 80);
  const outcome = parseOutcome(input.outcome);

  return {
    from: normalizedFrom.toISOString(),
    to: normalizedTo.toISOString(),
    auctionId,
    eventType,
    outcome,
    limit,
  };
}

/**
 * Executes a validated history query through the application port.
 */
export function queryLiveFeedHistory(store: LiveFeedHistoryStore, filters: LiveFeedHistoryFilters) {
  return store.query(filters);
}

function parseDate(value: unknown, field: string): Date | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new ApplicationError(`The ${field} time must be an ISO-8601 string.`, 400, 'invalid_history_range');
  }

  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new ApplicationError(`The ${field} time must be an ISO-8601 string.`, 400, 'invalid_history_range');
  }

  return parsed;
}

function parseLimit(value: unknown, maximum: number): number {
  if (value === undefined || value === '') {
    return defaultHistoryLimit;
  }

  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new ApplicationError('The history limit must be a positive integer.', 400, 'invalid_history_limit');
  }

  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > maximum) {
    throw new ApplicationError(`The history limit must be between 1 and ${maximum}.`, 400, 'invalid_history_limit');
  }

  return limit;
}

function parseOptionalText(value: unknown, field: string, maximumLength: number): string | undefined {
  if (value === undefined || value === '') {
    return undefined;
  }

  if (typeof value !== 'string' || value.length > maximumLength) {
    throw new ApplicationError(`The ${field} filter is invalid.`, 400, 'invalid_history_filter');
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

function parseOutcome(value: unknown): LiveFeedHistoryFilters['outcome'] {
  if (value === undefined || value === '') {
    return undefined;
  }

  if (value === 'applied' || value === 'stale' || value === 'ignored' || value === 'error') {
    return value;
  }

  throw new ApplicationError('The history outcome filter is invalid.', 400, 'invalid_history_filter');
}
