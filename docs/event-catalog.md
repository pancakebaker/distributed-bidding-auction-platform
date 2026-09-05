# Event Catalog

This catalog documents planned integration event contracts. Phase 4 publishes `BidAccepted` outbox rows to RabbitMQ. No shared event package is introduced yet.

## Event Envelope

```json
{
  "eventId": "uuid",
  "eventType": "BidAccepted",
  "occurredAtUtc": "2026-09-05T00:00:00Z",
  "aggregateId": "auction-id",
  "aggregateVersion": 42,
  "correlationId": "request-or-workflow-id",
  "payload": {}
}
```

`eventId` supports idempotency by giving every consumer a stable identifier it can record and ignore if delivered again.

`aggregateVersion` supports ordering and stale-event detection by identifying the version of the aggregate that produced the event. For `BidAccepted`, it equals the `Auction.Version` after the accepted bid commits.

`correlationId` supports tracing flows across HTTP requests, outbox persistence, future RabbitMQ delivery, workers, and live fan-out. The Bidding API accepts `X-Correlation-ID`; if it is absent, the API generates a GUID.

## Persisted In Phase 3

### BidAccepted

Producer: Bidding Service

Stored when and only when a bid is accepted and committed.

```json
{
  "eventId": "outbox-message-id",
  "eventType": "BidAccepted",
  "occurredAtUtc": "2026-09-05T00:00:00Z",
  "aggregateId": "auction-id",
  "aggregateVersion": 42,
  "correlationId": "request-or-workflow-id",
  "payload": {
    "bidId": "bid-id",
    "auctionId": "auction-id",
    "bidderId": "alice",
    "amount": 10500,
    "occurredAtUtc": "2026-09-05T00:00:00Z",
    "auctionVersion": 42
  }
}
```

The outbox row stores envelope metadata in columns and the event-specific contract in a PostgreSQL `jsonb` payload column. Rejected bids do not create `BidAccepted` messages.

## Planned Events

| Event | Producer | Initial Purpose | Status |
| --- | --- | --- | --- |
| AuctionCreated | Bidding Service | Announces a new auction exists | Planned |
| AuctionUpdated | Bidding Service | Announces changed auction metadata or state | Planned |
| BidAccepted | Bidding Service / Outbox Publisher | Announces a bid passed authoritative validation | Persisted and published to RabbitMQ |
| BidRejected | Bidding Service | Announces a rejected bid attempt when useful for workflows or audit | Planned |
| AuctionClosed | Auction Scheduler/Bidding Service | Announces bidding has closed | Planned |
| WinnerSelected | Auction Scheduler/Bidding Service | Announces the selected winning bid | Planned |
| PaymentRequested | Billing Worker | Announces that payment collection has started | Planned |
| PaymentSucceeded | Billing Worker | Announces successful payment | Planned |
| PaymentFailed | Billing Worker | Announces failed payment | Planned |

## RabbitMQ Transport

Phase 4 publishes UTF-8 JSON envelopes to the durable topic exchange `auction.events`.

| Event | Routing key | Delivery |
| --- | --- | --- |
| BidAccepted | `auction.bid.accepted` | Persistent message with publisher confirmation |

AMQP properties include `messageId = eventId`, `correlationId`, `contentType = application/json`, `contentEncoding = utf-8`, persistent delivery, and message `type = eventType`.

A local debug queue named `auction.events.debug` may be declared and bound with `auction.#` for verification. It is a development inspection queue, not a production consumer.

Delivery semantics are at-least-once. Duplicate messages are possible if the publisher crashes after RabbitMQ confirms but before PostgreSQL records `PublishedAtUtc`; consumers must be idempotent using `eventId`.
