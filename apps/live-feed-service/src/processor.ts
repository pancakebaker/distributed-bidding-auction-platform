import type { Server } from "socket.io";
import { parseBidAcceptedEnvelope, toSocketPayload } from "./events.js";
import { auctionRoom } from "./rooms.js";
import type { LiveFeedStateStore } from "./redisState.js";

export type ProcessResult =
  | { action: "broadcast"; eventId: string; aggregateId: string; aggregateVersion: number }
  | { action: "ignored"; reason: "duplicate" | "stale"; eventId: string; aggregateId: string; aggregateVersion: number }
  | { action: "invalid"; reason: string };

export class LiveFeedEventProcessor {
  public constructor(
    private readonly io: Server,
    private readonly stateStore: LiveFeedStateStore
  ) {}

  public async process(body: Buffer): Promise<ProcessResult> {
    let envelope;

    try {
      envelope = parseBidAcceptedEnvelope(body);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid event envelope.";
      console.warn("Dropping invalid live-feed message.", { reason: message });
      return { action: "invalid", reason: message };
    }

    const acceptance = await this.stateStore.acceptEvent(envelope);

    if (acceptance.status === "duplicate" || acceptance.status === "stale") {
      console.info("Ignoring duplicate or stale BidAccepted event.", {
        eventId: envelope.eventId,
        aggregateId: envelope.aggregateId,
        aggregateVersion: envelope.aggregateVersion,
        currentVersion: acceptance.previousVersion,
        status: acceptance.status,
        correlationId: envelope.correlationId
      });

      return {
        action: "ignored",
        reason: acceptance.status,
        eventId: envelope.eventId,
        aggregateId: envelope.aggregateId,
        aggregateVersion: envelope.aggregateVersion
      };
    }

    if (acceptance.status === "gap") {
      console.warn("BidAccepted event advanced auction version with a gap.", {
        eventId: envelope.eventId,
        aggregateId: envelope.aggregateId,
        previousVersion: acceptance.previousVersion,
        aggregateVersion: envelope.aggregateVersion,
        correlationId: envelope.correlationId
      });
    }

    const payload = toSocketPayload(envelope);
    this.io.to(auctionRoom(payload.auctionId)).emit("bid:accepted", payload);

    console.info("Broadcast BidAccepted event.", {
      eventId: envelope.eventId,
      aggregateId: envelope.aggregateId,
      aggregateVersion: envelope.aggregateVersion,
      correlationId: envelope.correlationId
    });

    return {
      action: "broadcast",
      eventId: envelope.eventId,
      aggregateId: envelope.aggregateId,
      aggregateVersion: envelope.aggregateVersion
    };
  }
}
