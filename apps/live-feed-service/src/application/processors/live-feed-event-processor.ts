/**
 * Framework-agnostic live-feed event processing and projection decisions.
 */
import type { LiveFeedEnvelope } from '../../domain/events.js';
import { toSocketPayload } from '../../domain/events.js';
import type { ActivityRecorder } from '../ports/activity-recorder.js';
import type { LiveFeedPublisher } from '../ports/live-feed-publisher.js';
import type { LiveStateStore } from '../ports/live-state-store.js';

/**
 * Result of handling a validated live-feed event, used by the RabbitMQ adapter for ACK decisions.
 */
export type ProcessResult =
  | { action: 'broadcast'; socketEvent: string; eventId: string; aggregateId: string; aggregateVersion: number }
  | {
      action: 'ignored';
      reason: 'duplicate' | 'stale';
      eventId: string;
      aggregateId: string;
      aggregateVersion: number;
    };

/**
 * Applies live-feed state decisions and delegates client publication through narrow application ports.
 */
export class LiveFeedEventProcessor {
  public constructor(
    private readonly publisher: LiveFeedPublisher,
    private readonly stateStore: LiveStateStore,
    private readonly activityRecorder?: ActivityRecorder,
  ) {}

  /**
   * Processes one validated event through state checks and the live-feed publisher port.
   */
  public async process(envelope: LiveFeedEnvelope): Promise<ProcessResult> {
    const acceptance = await this.stateStore.acceptEvent(envelope);

    if (acceptance.status === 'duplicate' || acceptance.status === 'stale') {
      console.info('Ignoring duplicate or stale live-feed event.', {
        eventId: envelope.eventId,
        eventType: envelope.eventType,
        aggregateId: envelope.aggregateId,
        aggregateVersion: envelope.aggregateVersion,
        currentVersion: acceptance.previousVersion,
        status: acceptance.status,
        correlationId: envelope.correlationId,
      });

      const result: ProcessResult = {
        action: 'ignored',
        reason: acceptance.status,
        eventId: envelope.eventId,
        aggregateId: envelope.aggregateId,
        aggregateVersion: envelope.aggregateVersion,
      };
      this.recordActivity(envelope, acceptance.status === 'stale' ? 'stale' : 'ignored');
      return result;
    }

    if (acceptance.status === 'gap') {
      console.warn('Live-feed event advanced auction version with a gap.', {
        eventId: envelope.eventId,
        eventType: envelope.eventType,
        aggregateId: envelope.aggregateId,
        previousVersion: acceptance.previousVersion,
        aggregateVersion: envelope.aggregateVersion,
        correlationId: envelope.correlationId,
      });
    }

    const socketEvent = socketEventName(envelope.eventType);
    const payload = toSocketPayload(envelope);
    this.publisher.publish({ auctionId: payload.auctionId, eventName: socketEvent, payload });

    console.info('Broadcast live-feed event.', {
      eventId: envelope.eventId,
      eventType: envelope.eventType,
      aggregateId: envelope.aggregateId,
      aggregateVersion: envelope.aggregateVersion,
      correlationId: envelope.correlationId,
    });

    const result: ProcessResult = {
      action: 'broadcast',
      socketEvent,
      eventId: envelope.eventId,
      aggregateId: envelope.aggregateId,
      aggregateVersion: envelope.aggregateVersion,
    };
    this.recordActivity(envelope, 'applied');
    return result;
  }

  /**
   * Records operational metadata without allowing observation to affect processing.
   */
  private recordActivity(envelope: LiveFeedEnvelope, outcome: 'applied' | 'stale' | 'ignored'): void {
    try {
      this.activityRecorder?.record({
        eventId: envelope.eventId,
        eventType: envelope.eventType,
        auctionId: envelope.payload.auctionId,
        aggregateVersion: envelope.aggregateVersion,
        correlationId: envelope.correlationId ?? undefined,
        receivedAt: new Date().toISOString(),
        outcome,
      });
    } catch (error) {
      console.warn('Live-feed operational activity observation failed.', {
        message: error instanceof Error ? error.message : 'unknown_error',
      });
    }
  }
}

function socketEventName(
  eventType: 'BidAccepted' | 'AuctionClosed' | 'WinnerSelected',
): 'bid:accepted' | 'auction:closed' | 'winner:selected' {
  if (eventType === 'BidAccepted') {
    return 'bid:accepted';
  }

  if (eventType === 'AuctionClosed') {
    return 'auction:closed';
  }

  return 'winner:selected';
}
