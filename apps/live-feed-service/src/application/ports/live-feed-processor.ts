/**
 * Application processing port consumed by the RabbitMQ adapter.
 */
import type { LiveFeedEnvelope } from '../../domain/events.js';
import type { ProcessResult } from '../processors/live-feed-event-processor.js';

/**
 * Minimal event-processing contract exposed outside the application processor.
 */
export interface LiveFeedProcessor {
  /**
   * Processes one validated live-feed event.
   */
  process(envelope: LiveFeedEnvelope): Promise<ProcessResult>;
}
