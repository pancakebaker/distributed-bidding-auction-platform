# Architecture

This project demonstrates a distributed bidding architecture with clear service boundaries. It is intentionally functional and educational before it is production hardened.

## Bidding Service Authority

The Bidding Service is authoritative for:

- accepting or rejecting bids
- auction bid state
- minimum bid validation
- auction open/closed validation
- bid ordering and versioning

Other services must not independently decide whether a bid is valid. PostgreSQL state owned by the Bidding Service is the authority for accepted bid history, current auction state, and durable event intent.

## Concurrency-Safe Bidding

`Auction.Version` is configured as an EF Core optimistic concurrency token and is monotonic. Every accepted bid advances the auction version exactly once; rejected bids and failed concurrency attempts do not advance it.

Bid placement uses a bounded retry strategy. Each attempt re-reads the auction row, validates the bid against server UTC and current PostgreSQL state, inserts one bid row, updates the auction current bid fields, increments the version, creates one outbox message, and commits in a single database transaction.

If another transaction updates the same auction first, EF Core detects the stale version through the database update condition. The service rolls back, clears tracked state, re-reads the current auction, and re-runs all bid rules. A bid that became stale after another accepted bid receives the normal minimum-bid error. A bid that continues to encounter write conflicts after the bounded retry limit receives a clear concurrency-conflict response.

PostgreSQL arbitrates writes, the Bidding Service remains authoritative, and retries are bounded to avoid unbounded request time.

## Transactional Outbox

Direct RabbitMQ publishing inside the bid request is intentionally avoided because the database commit and broker publish cannot be made atomic without another durability mechanism. Publishing directly could leave a committed bid without a message, or a message for a bid that later rolls back.

The outbox records event intent in the same PostgreSQL transaction as the accepted business change:

```text
POST bid
|
v
Bidding Service
|
v
PostgreSQL transaction
|
+-- Bid
+-- Auction
+-- OutboxMessage
|
COMMIT
```

Phase 3 persists only `BidAccepted` outbox messages. Rejected bids do not create integration events yet. Each outbox row stores an explicit JSON payload as `jsonb`, plus event metadata such as event type, aggregate ID, aggregate version, occurrence time, correlation ID, and publication state.

`AggregateVersion` equals the resulting `Auction.Version`. Later publishers and consumers can use this value for event ordering and stale-event detection. `CorrelationId` comes from `X-Correlation-ID` when provided, otherwise the API generates one; it is included in logs, response headers/body, and outbox rows.

The outbox publisher runs as a separate .NET worker in `workers/outbox-publisher`. It polls unpublished messages, claims batches with PostgreSQL `FOR UPDATE SKIP LOCKED`, publishes to RabbitMQ, waits for publisher confirmation, and then marks rows as published.

The publisher uses the durable topic exchange `auction.events`. `BidAccepted` is routed with `auction.bid.accepted`. A development-only debug queue, `auction.events.debug`, can be declared and bound with `auction.#` to inspect messages locally.

If RabbitMQ is unavailable, bid requests still commit because they only write PostgreSQL state and outbox rows. The publisher records concise publish errors, increments `PublishAttempts`, leaves `PublishedAtUtc` null, and retries on later polls.

Publisher confirms reduce the chance of marking undelivered messages as published, but they do not provide exactly-once delivery. A process can crash after RabbitMQ accepts a message and before PostgreSQL is updated. Consumers must therefore assume at-least-once delivery and use `eventId` for idempotency.

## Live Feed Service

The Live Feed Service never decides whether a bid is valid. It only broadcasts accepted state and accepted events that originated from the authoritative Bidding Service. It uses Socket.IO for client connections, and Redis supports fan-out when multiple live feed instances are running.

Later events will carry the Bidding Service auction version as `aggregateVersion` so real-time consumers can detect stale or out-of-order observations.

## RabbitMQ

RabbitMQ carries durable integration events between services. Consumers must be idempotent because at-least-once delivery must be assumed. Duplicate event delivery, redelivery after failures, and out-of-order observations are expected operational realities.

RabbitMQ publishing is implemented for outbox `BidAccepted` messages only. Consumers are still future work.

## Server Time

Server-side auction state and server time determine whether bids are valid. Browser time is never trusted for auction closure, countdown enforcement, or bid acceptance.

## Service Ownership

The bidding database is not shared directly with billing, catalog, notification, or live feed services. Services communicate through explicit HTTP contracts and integration events rather than reading each other's internal tables.

## Implementation Notes

The Bidding Service owns Auction, Bid, and OutboxMessage state in PostgreSQL through EF Core and Npgsql. Money is represented with `decimal` and mapped with fixed precision. Auction validity is evaluated with server-side UTC through .NET `TimeProvider`; browser/client time is not trusted.

No RabbitMQ consumers, Redis fan-out, Socket.IO bid broadcasts, billing workflows, notification workflows, or auction scheduler behavior are implemented through Phase 4.

