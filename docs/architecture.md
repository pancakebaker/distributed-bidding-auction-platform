# Architecture

This project demonstrates a distributed bidding architecture with clear service boundaries. It is intentionally functional and educational before it is production hardened.


## Client Application

The Laravel client is the browser-facing web shell. React renders the demo auction list and auction detail routes, calls the Bidding Service REST API directly, and subscribes to the Live Feed Service for `bid:accepted`, `auction:closed`, and `winner:selected` projections.

The client never decides whether a bid is valid. It submits commands to the Bidding Service, handles structured REST responses, and updates local UI state from accepted command responses. Socket.IO events are used for multi-browser convergence and live awareness.

Client-side version checks protect the view from stale live events. Lower versions are ignored. `BidAccepted` must advance the current version, while distinct lifecycle sibling events at the same version are allowed because one closure transaction may produce both `AuctionClosed` and `WinnerSelected`. This improves UI resilience but does not make browser state authoritative.

Browser countdowns are visual only. Server-side UTC validation in the Bidding Service remains the source of truth for scheduled, open, and closed auction behavior.
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
## Auction Scheduler

The Auction Scheduler is a separate .NET worker, independent of the HTTP API. It uses server-side UTC only and closes auctions where `Status = Open` and `EndTimeUtc <= current UTC`. Scheduled auctions that have not opened, cancelled auctions, and already closed auctions are ignored in this phase.

Each closure is committed in one PostgreSQL transaction. The scheduler re-reads and locks an eligible auction with `FOR UPDATE SKIP LOCKED`, verifies it is still open and expired, determines the winner from authoritative accepted bid state, sets `Auction.Status = Closed`, increments `Auction.Version` exactly once, and inserts lifecycle outbox rows. It never publishes directly to RabbitMQ.

```text
Auction Scheduler
|
v
PostgreSQL
|
+-- Auction close
+-- AuctionClosed outbox
+-- WinnerSelected outbox, when a winning bid exists
|
v
Outbox Publisher
|
v
RabbitMQ
```

Multiple scheduler instances are safe at the row-claiming level because locked rows are skipped by competitors. The version check remains in the update condition so the database still arbitrates stale state.

For a bid-versus-close race, PostgreSQL transaction ordering decides the serialized outcome. If a bid commits before the scheduler locks and closes the auction, the scheduler observes that accepted bid and can select it as winner. If the scheduler closes first, later bid placement re-reads the authoritative closed state or hits a concurrency conflict and is rejected by normal bid rules. No browser time participates.

`AuctionClosed` and `WinnerSelected` from the same close workflow use the same resulting `Auction.Version` and correlation ID. If an auction has no accepted bids, the scheduler emits `AuctionClosed` only.

## Live Feed Service

The Live Feed Service never decides whether a bid is valid. It only broadcasts accepted events that originated from the authoritative Bidding Service and arrived through RabbitMQ.

It consumes from one durable shared queue, `live-feed.bid-events`, bound to `auction.events` with `auction.bid.accepted`, `auction.closed`, and `auction.winner.selected`. Manual acknowledgement is used: valid messages are ACKed after validation, Redis idempotency/order checks, and Socket.IO fan-out. Malformed messages are NACKed without requeue and dead-lettered to `live-feed.bid-events.dlq`; transient processing failures are NACKed with requeue.

Redis supports live-feed behavior, not auction authority. It powers the Socket.IO Redis adapter for multi-instance fan-out, stores short-lived event idempotency keys by `eventId`, and stores the highest observed `aggregateVersion` per auction. The version update is atomic in Redis so competing live-feed instances do not race through a naive read-then-write path.

The service ignores duplicate event IDs and stale lower-version observations. `eventId` provides event uniqueness; `aggregateVersion` represents the resulting aggregate state version. Because one aggregate transition can produce multiple events, a new `AuctionClosed v16` and a new `WinnerSelected v16` are both accepted. If an event advances from version 42 to 44, the service accepts and broadcasts the newer authoritative state while logging the gap; it does not fabricate missing events or run a replay engine in this demo phase.

Socket.IO rooms are constructed server-side as `auction:{auctionId}` after validating that the client supplied a syntactically valid UUID. The frontend-facing events are `bid:accepted`, `auction:closed`, and `winner:selected`. They expose only auction-oriented payloads such as bid amount, final amount, winner, auction version, event time, and correlation ID; broker metadata stays internal.
### Live Feed Node Phase 1 structure and runtime diagnostics

The Node live-feed source is organized by its current responsibilities rather than by speculative abstractions:

```text
apps/live-feed-service/
  src/
    application/                 composition and event processing
    config/                      environment-backed configuration
    domain/                      event contracts and validation
    infrastructure/cache/        Redis state integration
    infrastructure/messaging/    RabbitMQ integration
    infrastructure/runtime/      event-loop and process diagnostics
    transport/websocket/         Socket.IO room/subscription helpers
    index.ts                     executable bootstrap
  scripts/                       development-only Socket.IO observer
  tests/integration/             RabbitMQ/Redis live-feed behavior tests
  tests/unit/                    runtime diagnostic tests
```

`GET /diagnostics/runtime` is a read-only, observational endpoint. It reports Node version, process uptime, selected `process.memoryUsage()` categories (`rss`, `heapTotal`, `heapUsed`, `external`, and `arrayBuffers`, all in bytes), event-loop utilization, and event-loop delay percentiles normalized from nanoseconds to milliseconds. It does not read or modify auction state, Redis state, RabbitMQ messages, or Socket.IO rooms. `/health` remains unchanged.

Node JavaScript runs primarily on the event-loop thread. Async I/O allows the process to await external work, but JavaScript execution itself is not automatically multithreaded. Event-loop delay indicates blocked or overloaded JavaScript execution; CPU-heavy work must not block that thread. Worker Threads are reserved for a later phase and are not implemented here. Cluster, Child Processes, streaming exports, SSR, PostgreSQL, and BFF behavior are also outside this phase.

The runtime monitor starts and stops explicitly with the service, has no import-time side effects, and does not continuously log or poll. V8/process memory categories are diagnostic observations only. The Bidding Service remains authoritative for bid acceptance/rejection, auction state, lifecycle transitions, and aggregate-version assignment; the Node service remains a downstream RabbitMQ/Redis/Socket.IO projection and fan-out service.

### Live Feed Node Phase 2 asynchronous context tracking

The live-feed service uses Node's built-in `AsyncLocalStorage` to attach observational metadata to one HTTP request or RabbitMQ delivery without manually threading correlation fields through every asynchronous method. The context may contain `requestId`, `correlationId`, `eventId`, and `auctionId`.

HTTP requests are scoped in Express middleware. An incoming `x-correlation-id` is preserved, and an optional `x-request-id` is tracked when supplied; no competing request-ID generator is introduced. The existing `/health` contract is unchanged. The runtime diagnostics response may include the safe, additive `requestContext` fields.

RabbitMQ deliveries are scoped after parsing the existing event envelope:

```text
RabbitMQ Event
↓
AsyncLocalStorage context
↓
Processor
↓
Redis
↓
Socket.IO
```

AsyncLocalStorage context propagates through Promise/await continuations and standard asynchronous resources. Each request or message receives an isolated scope, so concurrent operations cannot cross-contaminate correlation metadata. Missing or malformed correlation metadata produces an empty/partial observational context and never changes validation, Redis acceptance, ACK/NACK, retry, DLQ, ordering, or client output behavior.

Context is not application state and is never used as a source of auction correctness. The Bidding Service remains authoritative, and event contracts remain unchanged. Existing direct console logging was intentionally not redesigned in this phase; `getContext()` is available for a later focused logging integration.
### Live Feed Node Phase 3 failure handling and graceful shutdown

The live-feed service classifies client-safe boundary failures with a small `ApplicationError` model and maps them through one Express error handler. Successful responses, including `/health` and `/diagnostics/runtime`, remain unchanged. Unknown failures receive a generic 500 response without internal causes, stack traces, credentials, or connection strings.

Startup and shutdown are coordinated explicitly. If startup fails after resources have been created, the same cleanup path is run before the original failure is rethrown. For ordinary `SIGTERM` or `SIGINT`, the service runs one idempotent shutdown coordinator:

```text
SIGTERM / SIGINT
↓
shutdown coordinator
↓
cancel RabbitMQ consumer and await in-flight handlers
↓
close Socket.IO / HTTP
↓
close Redis clients
↓
stop event-loop monitoring
```

RabbitMQ cancellation stops new deliveries where the client permits it; already-delivered messages retain their existing processing and ACK/NACK behavior. Cleanup steps continue in order if an already-closing dependency reports an error, and repeated shutdown calls share one completion promise.

`unhandledRejection` and `uncaughtException` are treated as fatal process conditions. The lifecycle manager records a concise diagnostic, sets a non-zero exit intent, and invokes the same graceful shutdown path once. The service does not attempt to continue normal operation after an uncaught exception. Ordinary signal shutdown does not set a failure exit code.

AsyncLocalStorage and runtime diagnostics remain observational only. Shutdown does not mutate auction state, alter Redis version guards, change broker topology, or change Socket.IO contracts. The Bidding Service remains authoritative for all auction and bidding correctness decisions.
## RabbitMQ

RabbitMQ carries durable integration events between services. Consumers must be idempotent because at-least-once delivery must be assumed. Duplicate event delivery, redelivery after failures, and out-of-order observations are expected operational realities.

RabbitMQ publishing is implemented for outbox `BidAccepted`, `AuctionClosed`, and `WinnerSelected` messages. The Live Feed Service consumes all three for real-time auction UI projection.

## Server Time

Server-side auction state and server time determine whether bids are valid. Browser time is never trusted for auction closure, countdown enforcement, or bid acceptance.

## Service Ownership

The bidding database is not shared directly with billing, catalog, notification, or live feed services. Services communicate through explicit HTTP contracts and integration events rather than reading each other's internal tables.

## Implementation Notes

The Bidding Service owns Auction, Bid, and OutboxMessage state in PostgreSQL through EF Core and Npgsql. Money is represented with `decimal` and mapped with fixed precision. Auction validity is evaluated with server-side UTC through .NET `TimeProvider`; browser/client time is not trusted.

RabbitMQ live-feed consumption, Redis idempotency/version tracking, Socket.IO bid and lifecycle broadcasts, the Laravel/React auction UI, automatic auction closing, and real-time closed/winner UI projection are implemented through Phase 8. Billing workflows, notification workflows, production authentication, payment flows, and admin auction management remain future work.
