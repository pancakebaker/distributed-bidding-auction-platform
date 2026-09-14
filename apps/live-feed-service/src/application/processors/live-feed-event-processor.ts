/**
 * Framework-agnostic live-feed event processing and projection decisions.
 */
import type { IntegrationEventType, LiveFeedEnvelope } from '../../domain/events.js';
import { integrationEventTypes, toSocketPayload } from '../../domain/events.js';
import { auctionSocketEvents } from '../../domain/transport.js';
import type { ActivityRecorder } from '../ports/activity-recorder.js';
import type { LiveFeedPublisher } from '../ports/live-feed-publisher.js';
import type { LiveStateStore } from '../ports/live-state-store.js';
import type { TenantRoomEvictor } from '../ports/tenant-room-evictor.js';

/**
 * Result of handling a validated live-feed event, used by the RabbitMQ adapter for ACK decisions.
 */
export type ProcessResult =
  | {
      action: 'broadcast';
      socketEvent: string;
      eventId: string;
      aggregateId: string;
      aggregateVersion: number;
    }
  | {
      action: 'ignored';
      reason: 'duplicate' | 'stale';
      eventId: string;
      aggregateId: string;
      aggregateVersion: number;
    }
  | {
      action: 'status-applied';
      eventId: string;
      aggregateId: string;
      aggregateVersion: number;
    };

/**
 * Applies live-feed state decisions and delegates client publication through narrow
 * application ports.
 */
export class LiveFeedEventProcessor {
  public constructor(
    private readonly publisher: LiveFeedPublisher,
    private readonly stateStore: LiveStateStore,
    private readonly activityRecorder?: ActivityRecorder,
    private readonly tenantRoomEvictor?: TenantRoomEvictor,
  ) {}

  /**
   * Processes one validated event through state checks and the live-feed publisher port.
   */
  public async process(envelope: LiveFeedEnvelope): Promise<ProcessResult> {
    if (envelope.eventType === integrationEventTypes.tenantStatusChanged) {
      return this.processTenantStatusChanged(envelope);
    }

    const auctionEnvelope = envelope;
    const acceptance = await this.stateStore.acceptEvent(auctionEnvelope);

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
      this.recordActivity(auctionEnvelope, acceptance.status === 'stale' ? 'stale' : 'ignored');
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

    const socketEvent = socketEventName(auctionEnvelope.eventType);
    const payload = toSocketPayload(auctionEnvelope);
    this.publisher.publish({
      tenantId: payload.tenantId,
      auctionId: payload.auctionId,
      eventName: socketEvent,
      payload,
    });

    console.info('Broadcast live-feed event.', {
      eventId: envelope.eventId,
      tenantId: envelope.payload.tenantId,
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
    this.recordActivity(auctionEnvelope, 'applied');
    return result;
  }

  private async processTenantStatusChanged(
    envelope: Extract<LiveFeedEnvelope, { eventType: 'TenantStatusChanged' }>,
  ): Promise<ProcessResult> {
    if (!this.stateStore.acceptTenantStatusEvent) {
      throw new Error('Tenant status event processing is not configured.');
    }

    const acceptance = await this.stateStore.acceptTenantStatusEvent(envelope);
    if (acceptance.status !== 'accepted') {
      console.info('Ignoring duplicate or stale tenant status event.', {
        eventId: envelope.eventId,
        tenantId: envelope.payload.tenantId,
        tenantVersion: envelope.payload.tenantVersion,
        currentVersion: acceptance.previousVersion,
        status: acceptance.status,
        correlationId: envelope.correlationId,
      });
      return {
        action: 'ignored',
        reason: acceptance.status === 'duplicate' ? 'duplicate' : 'stale',
        eventId: envelope.eventId,
        aggregateId: envelope.aggregateId,
        aggregateVersion: envelope.aggregateVersion,
      };
    }

    if (envelope.payload.currentStatus === 'Disabled') {
      if (!this.tenantRoomEvictor) {
        throw new Error('Tenant room eviction is not configured.');
      }
      try {
        await this.tenantRoomEvictor.evictTenantRooms(envelope.payload.tenantId);
      } catch (error) {
        await this.stateStore.rollbackTenantStatusEvent?.(envelope);
        throw error;
      }
    }

    console.info('Applied tenant status event to live-feed admission state.', {
      eventId: envelope.eventId,
      tenantId: envelope.payload.tenantId,
      tenantVersion: envelope.payload.tenantVersion,
      currentStatus: envelope.payload.currentStatus,
      correlationId: envelope.correlationId,
    });

    return {
      action: 'status-applied',
      eventId: envelope.eventId,
      aggregateId: envelope.aggregateId,
      aggregateVersion: envelope.aggregateVersion,
    };
  }

  /**
   * Records operational metadata without allowing observation to affect processing.
   */
  private recordActivity(
    envelope: Exclude<LiveFeedEnvelope, { eventType: 'TenantStatusChanged' }>,
    outcome: 'applied' | 'stale' | 'ignored',
  ): void {
    try {
      this.activityRecorder?.record({
        tenantId: envelope.payload.tenantId,
        eventId: envelope.eventId,
        eventType: envelope.eventType,
        auctionId: envelope.payload.auctionId,
        aggregateVersion: envelope.aggregateVersion,
        ...(envelope.eventType === integrationEventTypes.auctionPurchased
          ? {
              buyerId: envelope.payload.bidderId,
              finalPrice: envelope.payload.finalPrice,
            }
          : {}),
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
  eventType: IntegrationEventType,
):
  | typeof auctionSocketEvents.bidAccepted
  | typeof auctionSocketEvents.auctionClosed
  | typeof auctionSocketEvents.winnerSelected
  | typeof auctionSocketEvents.auctionPurchased
  | typeof auctionSocketEvents.auctionCancelled {
  if (eventType === integrationEventTypes.bidAccepted) {
    return auctionSocketEvents.bidAccepted;
  }

  if (eventType === integrationEventTypes.auctionClosed) {
    return auctionSocketEvents.auctionClosed;
  }

  if (eventType === integrationEventTypes.winnerSelected) {
    return auctionSocketEvents.winnerSelected;
  }

  if (eventType === integrationEventTypes.auctionCancelled) {
    return auctionSocketEvents.auctionCancelled;
  }

  return auctionSocketEvents.auctionPurchased;
}
