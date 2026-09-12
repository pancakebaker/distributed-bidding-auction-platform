# Event Catalog

This catalog documents the integration event contracts currently published by the Bidding Service and Auction Scheduler. The Outbox Publisher sends them to RabbitMQ, where the Node Live Feed and .NET Auction Operations Portal consume them through separate queues. No shared event package is introduced.

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

`aggregateVersion` supports ordering and stale-event detection by identifying the resulting version of the aggregate that produced the event. It is not a unique per-event sequence. `AuctionClosed` and `WinnerSelected` from one closure transaction can share the same aggregate version; `eventId` distinguishes the events.

`correlationId` supports tracing flows across HTTP requests, outbox persistence, RabbitMQ delivery, workers, and live fan-out. The Bidding API accepts `X-Correlation-ID`; if it is absent, the API generates a GUID.

## Persisted and Published

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
### AuctionClosed

Producer: Auction Scheduler

Stored when and only when an open auction is closed by authoritative server UTC.

```json
{
  "eventId": "outbox-message-id",
  "eventType": "AuctionClosed",
  "occurredAtUtc": "2026-09-05T00:00:00Z",
  "aggregateType": "Auction",
  "aggregateId": "auction-id",
  "aggregateVersion": 16,
  "correlationId": "scheduler-workflow-id",
  "payload": {
    "auctionId": "auction-id",
    "closedAtUtc": "2026-09-05T00:00:00Z",
    "finalBidAmount": 12500,
    "finalBidderId": "alice",
    "auctionVersion": 16
  }
}
```

If the auction has no accepted bids, `finalBidAmount` and `finalBidderId` are null.

### WinnerSelected

Producer: Auction Scheduler

Stored in the same close transaction only when the auction has a winning accepted bid.

```json
{
  "eventId": "outbox-message-id",
  "eventType": "WinnerSelected",
  "occurredAtUtc": "2026-09-05T00:00:00Z",
  "aggregateType": "Auction",
  "aggregateId": "auction-id",
  "aggregateVersion": 16,
  "correlationId": "scheduler-workflow-id",
  "payload": {
    "auctionId": "auction-id",
    "winningBidId": "bid-id",
    "winnerId": "alice",
    "amount": 12500,
    "selectedAtUtc": "2026-09-05T00:00:00Z",
    "auctionVersion": 16
  }
}
```

`AuctionClosed` and `WinnerSelected` from one closure workflow share the same resulting `Auction.Version` and correlation ID. The version is incremented once for the closure, not once per event.

### AuctionPurchased

Producer: Bidding Service

Stored when an explicit Buy Now command completes an auction. It is a purchase
event, not a bid event, and is persisted with its sibling `AuctionClosed` event
at the same resulting aggregate version.

```json
{
  "eventId": "outbox-message-id",
  "eventType": "AuctionPurchased",
  "occurredAtUtc": "2026-09-05T00:00:00Z",
  "aggregateType": "Auction",
  "aggregateId": "auction-id",
  "aggregateVersion": 12,
  "correlationId": "request-or-workflow-id",
  "payload": {
    "auctionId": "auction-id",
    "bidderId": "buyer-123",
    "finalPrice": 1000,
    "purchasedAtUtc": "2026-09-05T00:00:00Z",
    "auctionVersion": 12
  }
}
```

`AuctionPurchased` and `AuctionClosed` describe one atomic transition, have
distinct event IDs, and may be consumed in either order. `WinnerSelected` is
reserved for an ordinary winner derived from accepted bid history.

## Current and Deferred Events

| Event | Producer | Initial Purpose | Status |
| --- | --- | --- | --- |
| AuctionCreated | Bidding Service | Announces a new auction exists | Deferred |
| AuctionUpdated | Bidding Service | Announces changed auction metadata or state | Deferred |
| BidAccepted | Bidding Service / Outbox Publisher | Announces a bid passed authoritative validation | Persisted and published to RabbitMQ |
| BidRejected | Bidding Service | Announces a rejected bid attempt when useful for workflows or audit | Deferred |
| AuctionClosed | Auction Scheduler | Announces bidding has closed | Persisted and published to RabbitMQ |
| WinnerSelected | Auction Scheduler | Announces the selected winning bid | Persisted and published to RabbitMQ |
| AuctionPurchased | Bidding Service | Announces an explicit Buy Now purchase | Persisted and published to RabbitMQ |
| PaymentRequested | Billing Worker | Announces that payment collection has started | Deferred |
| PaymentSucceeded | Billing Worker | Announces successful payment | Deferred |
| PaymentFailed | Billing Worker | Announces failed payment | Deferred |

## RabbitMQ Transport

The Outbox Publisher publishes UTF-8 JSON envelopes to the durable topic exchange `auction.events`.

| Event | Routing key | Delivery |
| --- | --- | --- |
| BidAccepted | `auction.bid.accepted` | Persistent message with publisher confirmation |
| AuctionClosed | `auction.closed` | Persistent message with publisher confirmation |
| WinnerSelected | `auction.winner.selected` | Persistent message with publisher confirmation |
| AuctionPurchased | `auction.purchased` | Persistent message with publisher confirmation |

AMQP properties include `messageId = eventId`, `correlationId`, `contentType = application/json`, `contentEncoding = utf-8`, persistent delivery, and message `type = eventType`.

A local debug queue named `auction.events.debug` may be declared and bound with `auction.#` for verification. It is a development inspection queue, not a production consumer.

Delivery semantics are at-least-once. Duplicate messages are possible if the publisher crashes after RabbitMQ confirms but before PostgreSQL records `PublishedAtUtc`; consumers must be idempotent using `eventId`.
## Live Feed Consumer

The Live Feed Service consumes `BidAccepted`, `AuctionClosed`, `WinnerSelected`, and `AuctionPurchased` from the durable queue `live-feed.bid-events`, bound to `auction.events` with their corresponding routing keys. The Auction Operations Portal consumes the same event types from its separate durable `auction-operations.activity` queue.

The Live Feed Service validates the full envelope before fan-out. It uses `eventId` as a Redis idempotency key so duplicate RabbitMQ deliveries are ACKed but not rebroadcast. It uses `aggregateVersion` as the highest observed auction version so stale lower-version observations cannot move clients backward. New same-version lifecycle sibling events are accepted when their `eventId` has not been processed.

If an event version jumps forward, the service broadcasts the newer authoritative event and logs the gap. This keeps the demo simple while making it clear that RabbitMQ delivery should be treated as at-least-once, not globally perfectly ordered.

The Socket.IO events emitted to subscribed clients are `bid:accepted`, `auction:closed`, `winner:selected`, and `auction:purchased`. Internal broker metadata and outbox publish state are not exposed to browser clients.

For one Buy Now transition, both `auction:purchased` and `auction:closed` are
valid same-version sibling deliveries. Lower aggregate versions are stale;
new event IDs at the current version are valid siblings; duplicate event IDs
are ignored. The live-feed Redis projection keeps ordinary `currentBid*`
fields separate from terminal `finalWinnerId` and `finalPrice` fields.
