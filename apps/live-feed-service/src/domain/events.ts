/**
 * Live-feed event contracts and validation helpers for RabbitMQ messages and Socket.IO payloads.
 */

/** Wire-level integration event discriminator values. */
export const integrationEventTypes = {
  bidAccepted: 'BidAccepted',
  auctionClosed: 'AuctionClosed',
  winnerSelected: 'WinnerSelected',
} as const;

/** Wire-level aggregate discriminator values. */
export const aggregateTypes = {
  auction: 'Auction',
} as const;

/** Identifies the integration events accepted by the live-feed consumer. */
export type IntegrationEventType =
  (typeof integrationEventTypes)[keyof typeof integrationEventTypes];

/** Identifies the aggregate types represented by integration events. */
export type AggregateType = (typeof aggregateTypes)[keyof typeof aggregateTypes];

/**
 * Integration envelope published when the Bidding Service accepts a bid.
 */
export type BidAcceptedEnvelope = {
  eventId: string;
  eventType: typeof integrationEventTypes.bidAccepted;
  occurredAtUtc: string;
  aggregateType: typeof aggregateTypes.auction;
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

/**
 * Integration envelope published when the scheduler closes an auction.
 */
export type AuctionClosedEnvelope = {
  eventId: string;
  eventType: typeof integrationEventTypes.auctionClosed;
  occurredAtUtc: string;
  aggregateType: typeof aggregateTypes.auction;
  aggregateId: string;
  aggregateVersion: number;
  correlationId: string | null;
  payload: {
    auctionId: string;
    closedAtUtc: string;
    finalBidAmount: number | null;
    finalBidderId: string | null;
    auctionVersion: number;
  };
};

/**
 * Integration envelope published when a closed auction has an accepted winning bid.
 */
export type WinnerSelectedEnvelope = {
  eventId: string;
  eventType: typeof integrationEventTypes.winnerSelected;
  occurredAtUtc: string;
  aggregateType: typeof aggregateTypes.auction;
  aggregateId: string;
  aggregateVersion: number;
  correlationId: string | null;
  payload: {
    auctionId: string;
    winningBidId: string;
    winnerId: string;
    amount: number;
    selectedAtUtc: string;
    auctionVersion: number;
  };
};

/**
 * Union of auction events that the live-feed projection is allowed to consume.
 */
export type LiveFeedEnvelope = BidAcceptedEnvelope | AuctionClosedEnvelope | WinnerSelectedEnvelope;

/**
 * Frontend-facing payload emitted when a bid is accepted for an auction room.
 */
export type BidAcceptedSocketPayload = {
  auctionId: string;
  bidId: string;
  bidderId: string;
  amount: number;
  auctionVersion: number;
  occurredAtUtc: string;
  correlationId: string | null;
};

/**
 * Frontend-facing payload emitted when an auction transitions to closed.
 */
export type AuctionClosedSocketPayload = {
  auctionId: string;
  closedAtUtc: string;
  finalBidAmount: number | null;
  finalBidderId: string | null;
  auctionVersion: number;
  correlationId: string | null;
};

/**
 * Frontend-facing payload emitted when a winner is selected for a closed auction.
 */
export type WinnerSelectedSocketPayload = {
  auctionId: string;
  winningBidId: string;
  winnerId: string;
  amount: number;
  selectedAtUtc: string;
  auctionVersion: number;
  correlationId: string | null;
};

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Checks whether an integration value uses the UUID shape expected by event contracts.
 */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && uuidRegex.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isValidAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/**
 * Parses and validates a RabbitMQ message body as a supported live-feed event envelope.
 */
export function parseLiveFeedEnvelope(body: Buffer): LiveFeedEnvelope {
  let parsed: unknown;

  try {
    parsed = JSON.parse(body.toString('utf8'));
  } catch {
    throw new Error('Message body is not valid JSON.');
  }

  return validateLiveFeedEnvelope(parsed);
}

/**
 * Parses a RabbitMQ message body and rejects it unless it is a BidAccepted envelope.
 */
export function parseBidAcceptedEnvelope(body: Buffer): BidAcceptedEnvelope {
  const envelope = parseLiveFeedEnvelope(body);
  if (envelope.eventType !== integrationEventTypes.bidAccepted) {
    throw new Error('Unsupported eventType.');
  }

  return envelope;
}

/**
 * Validates unknown broker data before it can influence Redis state or Socket.IO clients.
 */
export function validateLiveFeedEnvelope(value: unknown): LiveFeedEnvelope {
  const base = validateBaseEnvelope(value);

  if (!isRecord(base.payload)) {
    throw new Error('Event payload must be an object.');
  }

  if (base.eventType === integrationEventTypes.bidAccepted) {
    return validateBidAcceptedEnvelopeFromBase(base);
  }

  if (base.eventType === integrationEventTypes.auctionClosed) {
    return validateAuctionClosedEnvelopeFromBase(base);
  }

  if (base.eventType === integrationEventTypes.winnerSelected) {
    return validateWinnerSelectedEnvelopeFromBase(base);
  }

  throw new Error('Unsupported eventType.');
}

/**
 * Validates unknown data as a BidAccepted envelope for publisher compatibility checks.
 */
export function validateBidAcceptedEnvelope(value: unknown): BidAcceptedEnvelope {
  const envelope = validateLiveFeedEnvelope(value);
  if (envelope.eventType !== integrationEventTypes.bidAccepted) {
    throw new Error('Unsupported eventType.');
  }

  return envelope;
}

function validateBaseEnvelope(value: unknown): Record<string, unknown> & {
  eventId: string;
  eventType: string;
  occurredAtUtc: string;
  aggregateType: AggregateType;
  aggregateId: string;
  aggregateVersion: number;
  correlationId: string | null;
  payload: unknown;
} {
  if (!isRecord(value)) {
    throw new Error('Event envelope must be an object.');
  }

  if (!isUuid(value.eventId)) {
    throw new Error('Event envelope has an invalid eventId.');
  }

  if (typeof value.eventType !== 'string' || value.eventType.trim().length === 0) {
    throw new Error('Event envelope has an invalid eventType.');
  }

  if (!isIsoDate(value.occurredAtUtc)) {
    throw new Error('Event envelope has an invalid occurredAtUtc.');
  }

  if (value.aggregateType !== aggregateTypes.auction) {
    throw new Error('Unsupported aggregateType.');
  }

  if (!isUuid(value.aggregateId)) {
    throw new Error('Event envelope has an invalid aggregateId.');
  }

  if (!isPositiveInteger(value.aggregateVersion)) {
    throw new Error('Event envelope has an invalid aggregateVersion.');
  }

  if (value.correlationId !== null && typeof value.correlationId !== 'string') {
    throw new Error('Event envelope has an invalid correlationId.');
  }

  return value as Record<string, unknown> & {
    eventId: string;
    eventType: string;
    occurredAtUtc: string;
    aggregateType: AggregateType;
    aggregateId: string;
    aggregateVersion: number;
    correlationId: string | null;
    payload: unknown;
  };
}

function validateBidAcceptedEnvelopeFromBase(
  value: ReturnType<typeof validateBaseEnvelope>,
): BidAcceptedEnvelope {
  const payload = value.payload as Record<string, unknown>;

  if (!isUuid(payload.bidId)) {
    throw new Error('BidAccepted payload has an invalid bidId.');
  }

  if (!isUuid(payload.auctionId)) {
    throw new Error('BidAccepted payload has an invalid auctionId.');
  }

  if (payload.auctionId !== value.aggregateId) {
    throw new Error('BidAccepted payload auctionId must match aggregateId.');
  }

  if (typeof payload.bidderId !== 'string' || payload.bidderId.trim().length === 0) {
    throw new Error('BidAccepted payload has an invalid bidderId.');
  }

  if (!isValidAmount(payload.amount)) {
    throw new Error('BidAccepted payload has an invalid amount.');
  }

  if (payload.auctionVersion !== value.aggregateVersion) {
    throw new Error('BidAccepted payload auctionVersion must match aggregateVersion.');
  }

  return {
    eventId: value.eventId,
    eventType: integrationEventTypes.bidAccepted,
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
      auctionVersion: payload.auctionVersion,
    },
  };
}

function validateAuctionClosedEnvelopeFromBase(
  value: ReturnType<typeof validateBaseEnvelope>,
): AuctionClosedEnvelope {
  const payload = value.payload as Record<string, unknown>;

  if (!isUuid(payload.auctionId)) {
    throw new Error('AuctionClosed payload has an invalid auctionId.');
  }

  if (payload.auctionId !== value.aggregateId) {
    throw new Error('AuctionClosed payload auctionId must match aggregateId.');
  }

  if (!isIsoDate(payload.closedAtUtc)) {
    throw new Error('AuctionClosed payload has an invalid closedAtUtc.');
  }

  if (payload.finalBidAmount !== null && !isValidAmount(payload.finalBidAmount)) {
    throw new Error('AuctionClosed payload has an invalid finalBidAmount.');
  }

  if (
    payload.finalBidderId !== null &&
    (typeof payload.finalBidderId !== 'string' || payload.finalBidderId.trim().length === 0)
  ) {
    throw new Error('AuctionClosed payload has an invalid finalBidderId.');
  }

  if (payload.auctionVersion !== value.aggregateVersion) {
    throw new Error('AuctionClosed payload auctionVersion must match aggregateVersion.');
  }

  return {
    eventId: value.eventId,
    eventType: integrationEventTypes.auctionClosed,
    occurredAtUtc: value.occurredAtUtc,
    aggregateType: value.aggregateType,
    aggregateId: value.aggregateId,
    aggregateVersion: value.aggregateVersion,
    correlationId: value.correlationId,
    payload: {
      auctionId: payload.auctionId,
      closedAtUtc: payload.closedAtUtc,
      finalBidAmount: payload.finalBidAmount,
      finalBidderId: payload.finalBidderId,
      auctionVersion: payload.auctionVersion,
    },
  };
}

function validateWinnerSelectedEnvelopeFromBase(
  value: ReturnType<typeof validateBaseEnvelope>,
): WinnerSelectedEnvelope {
  const payload = value.payload as Record<string, unknown>;

  if (!isUuid(payload.auctionId)) {
    throw new Error('WinnerSelected payload has an invalid auctionId.');
  }

  if (payload.auctionId !== value.aggregateId) {
    throw new Error('WinnerSelected payload auctionId must match aggregateId.');
  }

  if (!isUuid(payload.winningBidId)) {
    throw new Error('WinnerSelected payload has an invalid winningBidId.');
  }

  if (typeof payload.winnerId !== 'string' || payload.winnerId.trim().length === 0) {
    throw new Error('WinnerSelected payload has an invalid winnerId.');
  }

  if (!isValidAmount(payload.amount)) {
    throw new Error('WinnerSelected payload has an invalid amount.');
  }

  if (!isIsoDate(payload.selectedAtUtc)) {
    throw new Error('WinnerSelected payload has an invalid selectedAtUtc.');
  }

  if (payload.auctionVersion !== value.aggregateVersion) {
    throw new Error('WinnerSelected payload auctionVersion must match aggregateVersion.');
  }

  return {
    eventId: value.eventId,
    eventType: integrationEventTypes.winnerSelected,
    occurredAtUtc: value.occurredAtUtc,
    aggregateType: value.aggregateType,
    aggregateId: value.aggregateId,
    aggregateVersion: value.aggregateVersion,
    correlationId: value.correlationId,
    payload: {
      auctionId: payload.auctionId,
      winningBidId: payload.winningBidId,
      winnerId: payload.winnerId,
      amount: payload.amount,
      selectedAtUtc: payload.selectedAtUtc,
      auctionVersion: payload.auctionVersion,
    },
  };
}

/**
 * Converts a validated integration envelope into the smaller payload exposed over Socket.IO.
 */
export function toSocketPayload(
  envelope: LiveFeedEnvelope,
): BidAcceptedSocketPayload | AuctionClosedSocketPayload | WinnerSelectedSocketPayload {
  if (envelope.eventType === integrationEventTypes.bidAccepted) {
    return {
      auctionId: envelope.payload.auctionId,
      bidId: envelope.payload.bidId,
      bidderId: envelope.payload.bidderId,
      amount: envelope.payload.amount,
      auctionVersion: envelope.payload.auctionVersion,
      occurredAtUtc: envelope.occurredAtUtc,
      correlationId: envelope.correlationId,
    };
  }

  if (envelope.eventType === integrationEventTypes.auctionClosed) {
    return {
      auctionId: envelope.payload.auctionId,
      closedAtUtc: envelope.payload.closedAtUtc,
      finalBidAmount: envelope.payload.finalBidAmount,
      finalBidderId: envelope.payload.finalBidderId,
      auctionVersion: envelope.payload.auctionVersion,
      correlationId: envelope.correlationId,
    };
  }

  return {
    auctionId: envelope.payload.auctionId,
    winningBidId: envelope.payload.winningBidId,
    winnerId: envelope.payload.winnerId,
    amount: envelope.payload.amount,
    selectedAtUtc: envelope.payload.selectedAtUtc,
    auctionVersion: envelope.payload.auctionVersion,
    correlationId: envelope.correlationId,
  };
}
