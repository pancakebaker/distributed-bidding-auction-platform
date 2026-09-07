/**
 * Live-feed event processor that validates broker messages and broadcasts accepted events to auction rooms.
 */
import type { Server } from 'socket.io';
import { parseLiveFeedEnvelope, toSocketPayload } from '../../domain/events.js';
import { auctionRoom } from '../../transport/websocket/rooms.js';
import type { LiveFeedStateStore } from '../../infrastructure/cache/redis-state.js';

/**
 * Result of handling a broker message, used by the RabbitMQ consumer to ACK, ignore, or dead-letter.
 */
export type ProcessResult =
  | { action: 'broadcast'; socketEvent: string; eventId: string; aggregateId: string; aggregateVersion: number }
  | { action: 'ignored'; reason: 'duplicate' | 'stale'; eventId: string; aggregateId: string; aggregateVersion: number }
  | { action: 'invalid'; reason: string };

/**
 * Validates live-feed events, applies Redis idempotency/order checks, and broadcasts accepted events.
 */
export class LiveFeedEventProcessor {
  public constructor(
    private readonly io: Server,
    private readonly stateStore: LiveFeedStateStore,
  ) {}

  /**
   * Processes one RabbitMQ message body through validation, Redis state checks, and Socket.IO fan-out.
   */
  public async process(body: Buffer): Promise<ProcessResult> {
    let envelope;

    try {
      envelope = parseLiveFeedEnvelope(body);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid event envelope.';
      console.warn('Dropping invalid live-feed message.', { reason: message });
      return { action: 'invalid', reason: message };
    }

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

      return {
        action: 'ignored',
        reason: acceptance.status,
        eventId: envelope.eventId,
        aggregateId: envelope.aggregateId,
        aggregateVersion: envelope.aggregateVersion,
      };
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
    this.io.to(auctionRoom(payload.auctionId)).emit(socketEvent, payload);

    console.info('Broadcast live-feed event.', {
      eventId: envelope.eventId,
      eventType: envelope.eventType,
      aggregateId: envelope.aggregateId,
      aggregateVersion: envelope.aggregateVersion,
      correlationId: envelope.correlationId,
    });

    return {
      action: 'broadcast',
      socketEvent,
      eventId: envelope.eventId,
      aggregateId: envelope.aggregateId,
      aggregateVersion: envelope.aggregateVersion,
    };
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
