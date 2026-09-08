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

Node JavaScript runs primarily on the event-loop thread. Async I/O allows the process to await external work, but JavaScript execution itself is not automatically multithreaded. Event-loop delay indicates blocked or overloaded JavaScript execution; CPU-heavy work must not block that thread. Worker Threads are used only by the later Phase 6 bounded diagnostic activity calculation, not by the auction path. Cluster, Child Processes, streaming exports, SSR, PostgreSQL, and BFF behavior remain outside this phase.

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
### Live Feed Node Phase 4 framework-agnostic boundaries

The live-feed composition root still owns framework-specific wiring, but the core event processor now depends on two narrow application ports:

- `LiveStateStore` decides idempotency and aggregate-version outcomes.
- `LiveFeedPublisher` publishes an already-shaped client update.

The dependency direction is:

```text
RabbitMQ adapter
    ↓ validated domain event
Application event processor
    ↓ LiveStateStore port
Redis state adapter

Application event processor
    ↓ LiveFeedPublisher port
Socket.IO publisher adapter
```

The RabbitMQ adapter parses the existing envelope, seeds AsyncLocalStorage, invokes the processor, and retains all existing ACK/NACK decisions. The Redis adapter retains the Lua script, keys, serialization, TTL, and stale-version behavior. The Socket.IO adapter retains the `auction:{auctionId}` room names, browser event names, and payload shapes. Express remains a transport/composition concern for routes, middleware, error handling, and runtime endpoints.

Because the processor accepts validated domain events and narrow ports, it can be tested with small in-memory fakes without Express, RabbitMQ, Redis, or Socket.IO objects. These ports are intentionally use-case-specific rather than a generic repository or message-bus abstraction. The framework-specific composition and lifecycle code remains in the composition root by design; this phase does not claim complete framework independence.

This refactor changes dependency direction only. The Bidding Service remains authoritative, event contracts are unchanged, and Node remains a downstream projection/fan-out service. Redis stale-version semantics, RabbitMQ topology and ACK/NACK behavior, Socket.IO subscriptions, and HTTP contracts are unchanged.
### Live Feed Node Phase 5 read-only streaming

`GET /diagnostics/live-feed/stream` exposes a small, bounded runtime snapshot as newline-delimited JSON. It is diagnostic and read-only: it does not read or mutate auction projections, publish events, ACK/NACK RabbitMQ messages, or affect Socket.IO fan-out. Existing `/health` and `/diagnostics/runtime` contracts remain unchanged.

The endpoint uses Node built-in streams:

```text
Existing runtime snapshot
        ↓
Readable (object records)
        ↓
NDJSON Transform
        ↓
Buffer chunks
        ↓
HTTP response Writable
```

`pipeline()` connects the stages so backpressure flows from the HTTP socket upstream. When the response Writable applies pressure, Node pauses further source reads instead of building one large response string or array. The source and test sinks use small, explicit `highWaterMark` values as buffering thresholds for this demonstration; a `highWaterMark` is not a hard memory limit.

The transform encodes each line with `Buffer.from(..., 'utf8')`. Node `Buffer` values are `Uint8Array` subclasses, so the byte chunks retain normal typed-array compatibility without converting the application records into binary data prematurely. Serialization, source, and destination failures propagate through `pipeline()` to the HTTP boundary, where internal details remain hidden.

If a client disconnects, the route aborts a request-local `AbortSignal`, which tears down the pipeline and its streams. This cancellation is local to the diagnostic response and cannot block RabbitMQ processing or change Redis, auction, or client state. AsyncLocalStorage request context remains observational and can flow through the streaming callback, but it is not included as auction data or used for correctness.

The data source is intentionally a bounded runtime snapshot rather than a new event archive. Streaming here demonstrates incremental records, byte encoding, backpressure, cancellation, and error propagation without introducing persistence, reporting, PostgreSQL, Worker Threads, Cluster, Child Processes, SSR, or BFF behavior. The Bidding Service remains authoritative and all existing RabbitMQ, Redis, Socket.IO, lifecycle, and event contracts are unchanged.
### Live Feed Node Phase 6 Worker Thread activity diagnostics

`GET /diagnostics/live-feed/activity` runs a bounded, read-only histogram/percentile/checksum calculation over the existing runtime snapshot. It is diagnostic only and does not read or mutate Redis auction state, publish RabbitMQ messages, acknowledge deliveries, or emit Socket.IO updates.

The boundary is:

```text
HTTP request
    ↓
ActivityCalculator port
    ↓
Worker Thread adapter
    ↓
Worker Thread
    ↓
Pure CPU calculation
    ↓
HTTP response
```

The main Node thread continues to own HTTP, RabbitMQ, Redis, Socket.IO, AsyncLocalStorage, and lifecycle coordination. Only the bounded numeric calculation runs in a Worker Thread. Worker Threads share the process but execute JavaScript on separate threads, so they are appropriate for CPU-bound JavaScript—not a replacement for ordinary asynchronous network I/O.

The parent passes a small plain object as `workerData`; Node transfers it using structured cloning. No framework objects, clients, channels, sockets, functions, or request context are passed. AsyncLocalStorage is not automatically shared with the worker and remains observational on the main request path. A `transferList` is intentionally not used because this bounded input does not benefit from transferring ownership of a large `ArrayBuffer`.

Each invocation has a timeout and request-local `AbortSignal`. Timeout, client cancellation, worker errors, and abnormal exits reject only that activity operation, terminate its Worker, and use the existing safe HTTP error handling. Active diagnostic Workers are also terminated during the existing idempotent shutdown sequence. A single worker failure does not make the process fatal.

Worker Threads differ from Cluster and Child Processes: Workers provide separate JavaScript threads within one process and are suited to bounded CPU work; Cluster uses multiple processes for server scaling; Child Processes provide stronger process isolation. Cluster and Child Processes are not implemented here. The Bidding Service remains authoritative, and all existing event, Redis, RabbitMQ, Socket.IO, HTTP, streaming, and lifecycle contracts remain unchanged.
### Live Feed Node Phase 7 libuv and process-model diagnostics

Phase 7 adds two read-only runtime endpoints:

- `GET /diagnostics/runtime/thread-pool` runs a bounded asynchronous `crypto.pbkdf2()` operation. The cryptographic native work is backed by Node's internal libuv thread pool; its completion callback returns through the main event loop. It reports operation metadata and timing only, never the derived key, input, salt, secrets, or environment.
- `GET /diagnostics/runtime/child-process` invokes the current Node executable with a fixed `-e` probe using `spawn()` with `shell: false`. It returns safe child identity metadata only: PID, Node version, platform, and architecture.

The runtime model is:

```text
Main Node process
├── Event loop
│   ├── HTTP
│   ├── RabbitMQ
│   ├── Redis
│   └── Socket.IO
├── libuv thread pool
│   └── native crypto/fs/zlib work selected by Node APIs
├── Worker Thread
│   └── Phase 6 bounded CPU-heavy JavaScript calculation
└── Child Process
    └── isolated Phase 7 runtime probe
```

These mechanisms are distinct. The libuv pool is an internal native worker pool used by selected Node APIs; it is not a JavaScript Worker Thread, Cluster worker, or child process. Worker Threads run JavaScript on separate threads in the same process and remain the choice for the bounded Phase 6 CPU calculation. Child Processes have separate OS processes and heaps, communicate through IPC/stdout, and are useful when process isolation or an external executable is needed. AsyncLocalStorage context does not automatically cross into a child process or Worker Thread; it remains observational on the main request path.

The child probe uses no shell, no user-supplied executable or command, fixed arguments, bounded output, timeout handling, and request-local abort cleanup. A child failure affects only that diagnostic request. Cluster is intentionally not enabled: this service is container-friendly, RabbitMQ and the Redis adapter already support distributed coordination, and replica count belongs to deployment/orchestration rather than an additional in-container process-management layer.

`UV_THREADPOOL_SIZE` is documented rather than mutated at runtime. It must be set before Node initializes the pool; increasing it is not universally better and can increase CPU contention and memory use. Live-feed HTTP, RabbitMQ, Redis, and Socket.IO I/O remain on the main event-loop model, while CPU-heavy JavaScript remains isolated in Worker Threads.

The Phase 1 memory diagnostics expose `rss`, `heapTotal`, `heapUsed`, `external`, and `arrayBuffers` in bytes. V8 manages the JavaScript heap represented primarily by `heapTotal` and `heapUsed`; Buffer and other native allocations can contribute to `external` and `arrayBuffers`, and can increase RSS without a one-to-one increase in `heapUsed`. Worker Threads have separate JavaScript execution contexts/heaps within the process, while child processes have isolated process memory. No heap snapshots or GC tuning are introduced.

For scaling, the intended model is multiple service instances:

```text
Horizontal scaling
├── Container instance 1
├── Container instance 2
└── Container instance 3
```

rather than embedding Node Cluster workers inside one container. No Cluster mode or deployment-topology change is implemented. The Bidding Service remains authoritative, and all auction, event, Redis, RabbitMQ, Socket.IO, HTTP, streaming, Worker Thread, AsyncLocalStorage, and lifecycle contracts remain unchanged.
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

## Node Phase 8 Operations Admin Page

The live-feed service includes one small operations-facing read path at `GET /admin/live-feed`. The HTTP boundary authenticates a signed, short-lived, HttpOnly cookie, applies restrictive browser security headers, and renders a server-side React shell. The browser then hydrates that shell and subscribes to a dedicated admin-only Socket.IO room for bounded operational activity updates.

The flow is intentionally separate from auction correctness:

```text
HTTP admin request
    ↓
Signed cookie boundary + security headers
    ↓
Server-side dashboard render
    ↓
Browser hydration
    ↓
Admin Socket.IO subscription
    ↓
Bounded operational activity updates
```

`RecentActivityStore` retains only a small fixed number of safe summaries such as event type, event ID, auction ID, aggregate version, correlation ID, timestamp, and outcome. It is an in-memory operational ring buffer, not an event store, audit log, or durable source of truth. Activity recording is best-effort and observational: a recorder failure cannot change event acceptance, Redis version guards, ACK/NACK behavior, or client-facing auction payloads.

The page reuses existing runtime diagnostics, memory metrics, RabbitMQ/Redis status, connection counts, and the Phase 5/6/7 diagnostic links. It does not add auction CRUD, persistence, a reporting subsystem, or a BFF layer. The existing `/health`, `/diagnostics/runtime`, `/diagnostics/live-feed/stream`, `/diagnostics/live-feed/activity`, and runtime diagnostic contracts remain unchanged.

The admin boundary is deliberately small. Credentials are read from `LIVE_FEED_ADMIN_USERNAME`, `LIVE_FEED_ADMIN_PASSWORD`, and `LIVE_FEED_ADMIN_SESSION_SECRET`; no credentials or secrets are embedded in the page or initial state. The cookie is signed with an HMAC, marked HttpOnly and SameSite, expires, and uses `Path=/` so the authenticated Socket.IO handshake at `/socket.io` receives it; it is Secure in production. Widening the cookie path does not make admin endpoints unauthenticated: HTTP routes and admin Socket.IO access remain server-side authorized. CSP, frame, content-type, referrer, and form-action protections are applied to the admin responses. A process-local fallback session secret means a restart invalidates sessions when an explicit secret is not configured. Production deployments still need a full identity/authorization, CSRF, rate-limiting, TLS, and secret-management strategy.

The Socket.IO admin channel uses a separate `admin:live-feed` room and `admin:activity` event. A socket must present a valid admin cookie when requesting `admin:subscribe`; unauthorized sockets do not join the room. Existing browser auction rooms, event names, payloads, subscription flow, RabbitMQ topology, Redis keys/version semantics, and Bidding Service authority are unaffected.

Server-side rendering is used for a meaningful first response and hydration is used only for live admin updates. The page is intentionally small and uses `renderToString`; the service's Phase 5 NDJSON endpoint remains the separate demonstration of streaming and backpressure. React is a UI implementation detail of this transport boundary, not an application dependency. The dashboard is observational and must never be used to determine whether an auction event is valid or stale.

## Node Phase 9 durable live-feed history

The protected operations dashboard now has an optional durable history path:

```text
Live-feed event outcome
        ↓ best-effort metadata write
PostgreSQL live_feed_history
        ↓ bounded parameterized query
Admin history JSON or PDF response
```

The database adapter uses one `pg.Pool`, parameterized SQL, a unique `event_id`, and idempotent inserts. It stores operational metadata only; raw event payloads, credentials, and connection strings are never persisted or returned. Filters are bounded by a 31-day range, safe text lengths, and a maximum result count. The PDF export reuses the same filters and emits only safe summary columns.

PostgreSQL is optional for local development. When `LIVE_FEED_DATABASE_URL` is absent, the service uses a no-op unavailable store and the rest of the live-feed path remains available. When a database write or query fails, the admin history operation reports a safe unavailable response, while normal Redis projection, Socket.IO publication, RabbitMQ acknowledgment, event ordering, and aggregate-version guards remain unchanged. History recording is fire-and-forget and best-effort; it never becomes a source of business truth.

The migration is `apps/live-feed-service/migrations/001_create_live_feed_history.sql` and is applied with `npm run migrate:history`. The existing shutdown coordinator closes the PostgreSQL pool after the live-feed dependencies are stopped. The admin UI labels stored and returned timestamps as UTC and converts browser-local filter controls to explicit UTC query values.

The Phase 8 in-memory activity ring remains separate from durable history. It is used for fast operational updates over the admin Socket.IO channel, while PostgreSQL provides bounded query/export capability. Neither path accepts bids, mutates auction state, writes Redis projections, publishes RabbitMQ messages, or affects client-facing auction events. The Bidding Service remains authoritative.
