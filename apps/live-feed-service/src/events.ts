export type BidAcceptedEnvelope = {
  eventId: string;
  eventType: "BidAccepted";
  occurredAtUtc: string;
  aggregateType: "Auction";
  aggregateId: string;
  aggregateVersion: number;
  correlationId: string | null;
  payload: {
    bidId: string;
    auctionId: string;
    bidderId: string;
    amount: number;
    auctionVersion: number;
  };
};

export type BidAcceptedSocketPayload = {
  auctionId: string;
  bidId: string;
  bidderId: string;
  amount: number;
  auctionVersion: number;
  occurredAtUtc: string;
  correlationId: string | null;
};

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidRegex.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isValidAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function parseBidAcceptedEnvelope(body: Buffer): BidAcceptedEnvelope {
  let parsed: unknown;

  try {
    parsed = JSON.parse(body.toString("utf8"));
  } catch {
    throw new Error("Message body is not valid JSON.");
  }

  return validateBidAcceptedEnvelope(parsed);
}

export function validateBidAcceptedEnvelope(value: unknown): BidAcceptedEnvelope {
  if (!isRecord(value)) {
    throw new Error("Event envelope must be an object.");
  }

  if (!isUuid(value.eventId)) {
    throw new Error("Event envelope has an invalid eventId.");
  }

  if (value.eventType !== "BidAccepted") {
    throw new Error("Unsupported eventType.");
  }

  if (!isIsoDate(value.occurredAtUtc)) {
    throw new Error("Event envelope has an invalid occurredAtUtc.");
  }

  if (value.aggregateType !== "Auction") {
    throw new Error("Unsupported aggregateType.");
  }

  if (!isUuid(value.aggregateId)) {
    throw new Error("Event envelope has an invalid aggregateId.");
  }

  if (!isPositiveInteger(value.aggregateVersion)) {
    throw new Error("Event envelope has an invalid aggregateVersion.");
  }

  if (value.correlationId !== null && typeof value.correlationId !== "string") {
    throw new Error("Event envelope has an invalid correlationId.");
  }

  if (!isRecord(value.payload)) {
    throw new Error("Event payload must be an object.");
  }

  const payload = value.payload;

  if (!isUuid(payload.bidId)) {
    throw new Error("BidAccepted payload has an invalid bidId.");
  }

  if (!isUuid(payload.auctionId)) {
    throw new Error("BidAccepted payload has an invalid auctionId.");
  }

  if (payload.auctionId !== value.aggregateId) {
    throw new Error("BidAccepted payload auctionId must match aggregateId.");
  }

  if (typeof payload.bidderId !== "string" || payload.bidderId.trim().length === 0) {
    throw new Error("BidAccepted payload has an invalid bidderId.");
  }

  if (!isValidAmount(payload.amount)) {
    throw new Error("BidAccepted payload has an invalid amount.");
  }

  if (payload.auctionVersion !== value.aggregateVersion) {
    throw new Error("BidAccepted payload auctionVersion must match aggregateVersion.");
  }

  return {
    eventId: value.eventId,
    eventType: value.eventType,
    occurredAtUtc: value.occurredAtUtc,
    aggregateType: value.aggregateType,
    aggregateId: value.aggregateId,
    aggregateVersion: value.aggregateVersion,
    correlationId: value.correlationId,
    payload: {
      bidId: payload.bidId,
      auctionId: payload.auctionId,
      bidderId: payload.bidderId,
      amount: payload.amount,
      auctionVersion: payload.auctionVersion
    }
  };
}

export function toSocketPayload(envelope: BidAcceptedEnvelope): BidAcceptedSocketPayload {
  return {
    auctionId: envelope.payload.auctionId,
    bidId: envelope.payload.bidId,
    bidderId: envelope.payload.bidderId,
    amount: envelope.payload.amount,
    auctionVersion: envelope.payload.auctionVersion,
    occurredAtUtc: envelope.occurredAtUtc,
    correlationId: envelope.correlationId
  };
}

