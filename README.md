# Distributed Bidding Auction Platform

An end-to-end distributed auction platform demonstrating concurrency-safe bidding, transactional event publication, independent event consumers, real-time delivery, historical operations reporting, and measured .NET runtime behavior.

The repository is a portfolio and engineering demonstration. It is not a production deployment blueprint: TLS, secret management, capacity planning, compliance controls, and multi-instance operational hardening still need to be designed for a real deployment.

## Overview

The platform separates command handling from event-driven projections. Bidding Service decides whether a bid is accepted; Live Feed serves public real-time browser updates; the Auction Operations Portal independently persists operational activity for authenticated Blazor users, history, and reports.

## Architecture

```mermaid
flowchart LR
    U[Bidder / Admin User] --> C[Laravel + React Client]

    subgraph Core[Core auction services]
        direction LR
        B[Bidding Service<br/>ASP.NET Core]
        S[Auction Scheduler]
        PG1[(Bidding PostgreSQL)]
        O[Transactional Outbox]
        P[Outbox Publisher]
        B --> PG1
        B --> O
        S --> PG1
        S --> O
        O --> P
    end

    subgraph Messaging[Messaging]
        RMQ[(RabbitMQ<br/>auction.events)]
    end

    subgraph LiveFeed[Bidder-facing live feed]
        direction LR
        LF[Live Feed Service<br/>Node.js + TypeScript]
        R[(Redis)]
        SIO[Socket.IO]
        UI1[Browser Live Feed UI]
        LF --> R
        LF --> SIO --> UI1
    end

    subgraph Operations[Operations portal]
        direction LR
        AOP[Auction Operations Portal<br/>ASP.NET Core + Blazor]
        PG2[(Operations PostgreSQL<br/>auction_operations)]
        SIG[SignalR]
        UI2[Blazor Operations UI]
        AOP --> PG2
        AOP --> SIG --> UI2
    end

    C --> B
    P --> RMQ
    RMQ --> LF
    RMQ --> AOP
```

The two consumers are intentionally independent. The Node Live Feed queue and the portal activity queue have separate bindings, retry/DLQ behavior, and storage boundaries. Portal activity is an operational projection; it never becomes authoritative auction state.

The platform contains:

- a Laravel + React bidder/admin client;
- an ASP.NET Core Bidding Service with optimistic concurrency around `Auction.Version`;
- an Auction Scheduler and transactional Outbox Publisher;
- RabbitMQ fan-out on the `auction.events` exchange;
- a Node.js/TypeScript Live Feed using Redis and Socket.IO;
- an authenticated ASP.NET Core + Blazor Auction Operations Portal;
- PostgreSQL-backed operational history, PDF reporting, SignalR delivery, and focused observability;
- an isolated BenchmarkDotNet project for runtime and allocation experiments.

See the [system architecture notes](docs/architecture.md), [event catalog](docs/event-catalog.md), and [demo walkthrough](docs/demo-walkthrough.md) for deeper subsystem detail.

## Demo Screenshots

![Live auction](docs/assets/auction-live.png)

![Two synchronized clients](docs/assets/auction-two-clients.png)

![Closed auction with winner](docs/assets/auction-closed.png)

## Core Components

| Component | Responsibility |
| --- | --- |
| Laravel + React Client | Bidder/tenant-admin web experience and Laravel BFF |
| Bidding Service | Validates and accepts bids; owns authoritative auction state and concurrency |
| Auction Scheduler | Applies scheduled auction lifecycle transitions in the bidding database and writes lifecycle outbox events |
| Outbox Publisher | Publishes committed outbox events to RabbitMQ |
| RabbitMQ | Durable event exchange and independent consumer queues |
| Live Feed Service | Consumes live bid events, applies Redis idempotency/version checks, and emits Socket.IO updates |
| Auction Operations Portal | Consumes activity events, stores an independent projection, serves authenticated live/history/reporting views |
| PostgreSQL | Separate bidding and operations databases; the portal owns `auction_activity` |
| Redis | Live Feed idempotency and version state; not a portal source of truth |

Subsystem documentation:

- [Auction Operations Portal](apps/auction-operations-portal/README.md)
- [Client](apps/client/README.md)
- [Architecture reference](docs/architecture.md)
- [Failure scenarios](docs/failure-scenarios.md)

## Event Flow

Accepted bid command flow:

```mermaid
flowchart LR
    C[Laravel / React Client] --> B[Bidding Service]
    B --> V[Validate auction<br/>and current state]
    V --> TX[(PostgreSQL transaction<br/>insert bid<br/>update auction/version<br/>insert outbox event)]
    TX -->|commit| P[Outbox Publisher]
    P --> RMQ[(RabbitMQ<br/>auction.events)]
```

The Bidding Service owns the bid decision. Optimistic concurrency conflicts are retried according to the service’s existing policy; a successfully accepted bid increments the aggregate version exactly once, while a rejected bid does not mutate the aggregate version. The outbox record is committed atomically with the authoritative state change. The publisher later delivers the committed event; RabbitMQ is not on the synchronous bid-acceptance path.

RabbitMQ fans out to separate durable queues:

```mermaid
flowchart LR
    RMQ[(auction.events)]
    RMQ --> Q1[Durable queue<br/>live-feed.bid-events]
    Q1 --> LF[Node Live Feed]
    RMQ --> Q2[Durable queue<br/>auction-operations.activity]
    Q2 --> AOP[.NET Auction Operations Portal]
```

One consumer cannot steal messages from the other because the queues and bindings are separate. Delivery is at least once. The portal uses database-enforced EventId idempotency; `AuctionClosed` and `WinnerSelected` can share an `AggregateVersion` while remaining distinct events because their EventIds differ.

The two real-time paths are deliberately different:

```text
RabbitMQ -> Node Live Feed -> Redis ordering/idempotency -> Socket.IO -> Laravel/React browser
RabbitMQ -> Portal consumer -> PostgreSQL -> SignalR -> Blazor Operations UI
```

The Node path is optimized for public live-feed delivery. The portal path persists before SignalR publication; SignalR is best-effort, and reconnect reconciliation reloads recent persisted activity. PostgreSQL is the operations source of truth. Portal history and PDF reports query PostgreSQL, not Bidding Service tables or Redis.

Delivery is at least once. `EventId` is the idempotency key. `AggregateVersion` is observational metadata and is not globally unique: `AuctionClosed` and `WinnerSelected` can legitimately share a version while remaining distinct events.

## Authentication Flow

Laravel owns bidder and tenant-admin identity. The Operations Portal owns platform SystemAdministrator identity:

```mermaid
flowchart LR
    L[Laravel login<br/>tenant admin] --> B[Laravel BFF<br/>auction commands]
    S[SystemAdministrator<br/>Operations Portal /login] --> T[Short-lived RS256<br/>live-feed-admin token]
    T --> N[Node Live Feed<br/>opaque one-time handoff]
    N --> NC[HttpOnly Live Feed<br/>session cookie]
```

1. Tenant bidders and tenant administrators authenticate with Laravel for tenant-facing flows.
2. System administrators authenticate directly with the Operations Portal local account store.
3. The portal issues a short-lived RS256 token for `live-feed-admin` server-to-server.
4. Live Feed validates the independent issuer, audience, explicit key ID, role, permission, signature, expiry, and JTI.
5. Only a short-lived opaque handoff code crosses the browser boundary; the JWT never enters browser storage or a URL.

Portal pages and the SignalR hub require the `AuctionOperationsAdmin` policy. Portal logout clears only the portal cookie and returns to `/login`.

The Operations Portal holds the system-admin private signing key. Live Feed receives public verification material only and uses Redis-backed JTI replay protection. Tenant Laravel tokens are scoped to Bidding Service audiences and are not accepted by platform-admin surfaces.

## Operations Portal

The portal is an independent consumer and projection:

- `/activity/live`: bounded recent activity plus authenticated SignalR updates;
- `/activity/history`: UTC date-range, aggregate ID, event-type, and server-side pagination filters;
- `GET /activity/report.pdf`: authenticated, rate-limited PDF reports using the same validated filters;
- `/health`: anonymous aggregate health status for PostgreSQL and RabbitMQ.

History uses inclusive UTC boundaries, a maximum 31-day range, exact aggregate filtering, known event-type filtering, page sizes of 25/50/100, and deterministic ordering by `OccurredAtUtc` then `Id`. Reports reuse those filters, use chronological ordering, compute server-side summary counts, and reject results over 5,000 rows rather than silently truncating them. QuestPDF 2026.8.0 renders the bounded report; the response is an `application/pdf` attachment, limited to five requests per authenticated user per minute, and contains no raw payload JSON. Deployment must verify QuestPDF Community License eligibility.

The portal consumer persists before publishing SignalR. SignalR is best-effort: a push failure is logged and measured, the durable row remains authoritative, and reconnecting clients reconcile from PostgreSQL by EventId.

Completed portal capabilities are the authenticated Blazor shell, real-time activity, recent reconciliation, historical search and filters, server-side pagination, PDF reports, report rate limiting, the anonymous aggregate health endpoint, OpenTelemetry instrumentation, and the BenchmarkDotNet project.

## Observability

The portal uses OpenTelemetry with:

- ActivitySource: `AuctionOperationsPortal`;
- ASP.NET Core, HttpClient, and EF Core instrumentation;
- custom spans for message processing, persistence, SignalR publication, history, reports, and system-admin handoff validation;
- bounded metrics for processed/duplicate/rejected/transient events, SignalR publication, reports, and operation durations;
- PostgreSQL and RabbitMQ health checks at `/health`.

OTLP and console exporters are opt-in/configurable; normal local startup does not require a collector. Correlation IDs from the existing RabbitMQ message properties remain structured log/trace metadata. The publisher does not currently emit W3C trace context, so end-to-end trace continuity begins at the portal consumer boundary without changing event payloads or routing.

Portal metrics use bounded dimensions only; EventId, CorrelationId, AggregateId, user identifiers, JTI, and arbitrary filter text are excluded from metric labels:

| Metric | Type / unit |
| --- | --- |
| `portal.events.processed` | counter / events |
| `portal.events.duplicate` | counter / events |
| `portal.events.rejected` | counter / events |
| `portal.events.transient_failures` | counter / failures |
| `portal.signalr.publications` | counter / notifications |
| `portal.signalr.publish_failures` | counter / failures |
| `portal.reports.generated` | counter / reports |
| `portal.reports.rejected` | counter / reports |
| `portal.event.processing.duration`, `portal.history.query.duration`, `portal.report.generation.duration` | histogram / milliseconds |
| `portal.report.row_count` | histogram / rows |

## Security Highlights

- Laravel owns bidder and tenant-admin identity; the portal owns independent SystemAdministrator identity and accepts only the dedicated RS256 audience and permission for Live Feed access.
- Portal sessions use short-lived HttpOnly cookies that are Secure outside Development/Testing.
- Authorization is enforced server-side for pages, the SignalR hub, and report endpoints.
- Live Feed consumes system-admin token JTIs once through Redis before issuing an opaque browser handoff code.
- PDF generation is bounded and rate-limited.
- No secrets are committed, and reporting exposes safe projected fields rather than raw event payloads.

## Runtime / Performance

The isolated [BenchmarkDotNet project](apps/auction-operations-portal.Benchmarks/) measures realistic in-process paths:

- event envelope deserialization;
- envelope-to-activity and activity-to-notification mapping;
- bounded live-state merge/deduplication;
- report-row preparation at 100, 1,000, and 5,000 rows.

Run benchmarks manually:

```powershell
dotnet run -c Release --project apps/auction-operations-portal.Benchmarks
```

The project uses BenchmarkDotNet 0.15.8 and `MemoryDiagnoser`. Results are observational and machine-dependent; benchmark timings are not CI gates. Runtime notes in the [portal README](apps/auction-operations-portal/README.md) cover Gen0/1/2, Server GC, the LOH, async plumbing, DI validation, and diagnostic tools such as `dotnet-counters`, `dotnet-trace`, and `dotnet-gcdump`. Span/Memory/ArrayPool and ValueTask were evaluated but not introduced without a measured production hotspot.

## Key Engineering Decisions

- **Authoritative state:** only the Bidding Service owns auction state and bid acceptance.
- **Concurrency:** `Auction.Version` protects state transitions; it is not an event identity.
- **Transactional outbox:** state changes and event publication intent commit together.
- **At-least-once delivery:** consumers acknowledge only after their durable work succeeds.
- **Independent projections:** Live Feed and the portal have separate queues and storage.
- **Portal idempotency:** the portal database uniquely constrains EventId.
- **Lifecycle events:** same-version sibling events remain distinct by EventId.
- **Real-time delivery:** SignalR is transient best-effort delivery; PostgreSQL supports reconciliation.
- **Identity:** Laravel owns bidder and tenant-admin identity; the Operations Portal owns independent SystemAdministrator identity and its local session.
- **Reporting:** history and PDF reports use only the portal-owned projection.

## Local Development

Prerequisites: .NET SDK, Node.js/npm, PHP/Composer, Docker Desktop, and a local PostgreSQL/RabbitMQ/Redis environment.

From the repository root:

```powershell
Copy-Item .env.example .env
Copy-Item apps/client/.env.example apps/client/.env
New-Item -ItemType File -Path apps/client/database/database.sqlite -Force
dotnet restore
npm ci
npm ci --prefix apps/live-feed-service
npm ci --prefix apps/client
composer install --working-dir=apps/client
php apps/client/artisan key:generate
./scripts/generate-system-admin-keys.ps1
php apps/client/artisan migrate
php apps/client/artisan db:seed
npm run migrate:history --prefix apps/live-feed-service
dotnet ef database update --project apps/auction-operations-portal --startup-project apps/auction-operations-portal
./scripts/start-demo.ps1
```

The copied `apps/client/.env` provides local-only demo values for
`LOCAL_ADMIN_EMAIL`, `LOCAL_ADMIN_PASSWORD`, and `DEMO_BIDDER_PASSWORD`.
Change them before using any non-local environment. `db:seed` is the canonical
local bootstrap: it creates the CMS demo content, the configured tenant admin,
and the three demo bidders. It is safe to run again; the configured local
admin password is refreshed while each user's stable `subject_id` is retained.
The seeders refuse to run outside local/testing environments.

The existing `start-demo.ps1` starts the Bidding Service, Outbox Publisher, Auction Scheduler, Live Feed, Laravel, Vite/client, and Auction Operations Portal in separate PowerShell windows. The portal uses `dotnet run --no-restore`, checks its restored assets before launch, skips a duplicate when port `5099` is already listening, and waits for `/health` before printing the startup summary:

```powershell
dotnet run --no-restore --project apps/auction-operations-portal --urls http://localhost:5099
```

Useful local URLs:

- Client: `http://localhost:8000/auctions`
- Laravel tenant admin: `http://localhost:8000/admin`
- Operations Portal login: `http://localhost:5099/login`
- Operations live activity: `http://localhost:5099/activity/live`
- portal history: `http://localhost:5099/activity/history`
- portal health: `http://localhost:5099/health`
- Bidding Service Swagger: `http://localhost:5000/swagger`
- Live Feed health: `http://localhost:3001/health`
- RabbitMQ management: `http://localhost:15672`

### Development/demo accounts

#### Laravel tenant administrator

Use `local-admin@example.test` (or the configured `LOCAL_ADMIN_EMAIL`) and the
`LOCAL_ADMIN_PASSWORD` value for `/admin`, `/admin/auctions`, CMS, and
tenant/business management. This is a Laravel tenant administrator, not the
Operations Portal SystemAdministrator.

#### Demo bidders

Use `bidder1@example.test`, `bidder2@example.test`, or
`bidder3@example.test` with `DEMO_BIDDER_PASSWORD` for bidding and Buy Now.
There is no public bidder signup; these accounts are development/demo only.

#### System Administrator

Use `systemadmin@example.test` with `SYSTEM_ADMIN_DEMO_PASSWORD` (or the
development fallback `system-admin-password`) at the Operations Portal login.
This identity belongs to the Operations Portal and is used for system
monitoring and live activity. It is not created in Laravel's `users` table.

`start-demo.ps1` checks the fixed-name Redis, RabbitMQ, and PostgreSQL
containers before starting Compose. Compatible existing containers are reused
with a warning, which allows multiple checkouts to share local infrastructure;
that also means they share the same persistent data. Use `docker compose down`
when a fully isolated stack is required.

The Operations Portal's **Open Live Feed administration** action uses the local
SystemAdministrator session to issue a short-lived server-side `live-feed-admin`
JWT. Live Feed validates the independent `dbap-system-admin` issuer, audience,
explicit key ID, role, permission, and signature, then returns a one-time opaque
handoff code. Only that code crosses the browser boundary; the JWT remains
server-to-server. Laravel tenant administration remains separate, and public
auction Socket.IO rooms remain anonymous.

The PostgreSQL initialization creates `auction_operations` on a fresh volume. For an existing volume created before the portal was added, create that database idempotently with the documented PostgreSQL setup; do not destroy the volume to rerun initialization.

## Testing and Validation

The current repository validation includes:

| Area | Current result |
| --- | --- |
| .NET portal | 51 tests |
| Bidding Service | 24 tests |
| Auction Scheduler | 6 tests |
| Outbox Publisher | 7 tests |
| .NET total | 88 tests |
| Laravel | 79 tests, 362 assertions |
| Live Feed | 79 passed, 1 skipped |
| Client | 40 Vitest tests |

These are current repository counts and can change as the codebase evolves.

Typical commands:

```powershell
dotnet test
php apps/client/artisan test
npm test --prefix apps/live-feed-service
npm test --prefix apps/client
npm test
npm run lint
npm run typecheck
npm run build
```

Targeted portal-authored formatting checks pass. The repository still has a documented pre-existing root Prettier baseline outside the portal scope; no broad formatting rewrite is part of this project.

### CI coverage

The current GitHub Actions workflow, `.github/workflows/dotnet-static-analysis.yml`, restores and builds the .NET solution, then installs JavaScript dependencies and runs the repository formatting check, ESLint, TypeScript checks, JavaScript/TypeScript builds, Live Feed tests, and client tests. It does not currently run `dotnet test`, Laravel tests, or the portal’s PostgreSQL-backed integration tests; those remain part of the local validation sequence below. The root Prettier baseline is documented separately and is not represented as a green repository-wide claim here.

For a local validation pass, use the canonical commands below. From the repository root:

```powershell
dotnet restore
dotnet build
dotnet test
npm ci
npm run lint
npm run typecheck
npm run build
npm test
npm test --prefix apps/live-feed-service
npm test --prefix apps/client
composer install --working-dir=apps/client
Push-Location apps/client
php artisan test
Pop-Location
```

## Repository Structure

```
apps/
  auction-operations-portal/          ASP.NET Core + Blazor portal
  auction-operations-portal.Tests/    portal integration/unit tests
  auction-operations-portal.Benchmarks/ BenchmarkDotNet project
  bidding-service/                    authoritative auction API
  live-feed-service/                  Node.js/TypeScript live feed
  client/                             Laravel + React application
workers/
  auction-scheduler/                  scheduled auction transitions
  outbox-publisher/                   transactional outbox publisher
docs/                                  architecture, event, demo, and failure docs
infrastructure/                       Docker Compose and database initialization
scripts/                              local setup and demo helpers
```

## Design Tradeoffs and Deferred Features

The completed platform intentionally does not include:

- **Auction CRUD or an API gateway:** deferred because current service routing does not justify another operational layer; the Bidding Service remains the command boundary.
- **Portal Redis caching:** deferred because bounded PostgreSQL history/report queries do not justify cache invalidation and staleness complexity.
- **End-to-end W3C trace continuity:** deferred until the publisher emits `traceparent`/`tracestate`; the portal preserves existing correlation IDs without changing producer contracts.
- **Distributed portal session coordination:** future deployment hardening may add shared coordination for multi-instance portal sessions; the current local cookie remains the browser session authority.
- **Background report jobs, scheduling, email delivery, or report persistence:** deferred because current reports are bounded synchronous requests.
- **Full bidder account administration, payment workflows, and notification workflows:** outside the completed platform scope.
- **A mandatory OpenTelemetry collector/Grafana/Prometheus/Jaeger stack:** deferred because local development remains usable with exporters disabled.
- **Multi-instance SignalR backplane and distributed live-session coordination:** deferred until deployment scale requires it.
- **Production deployment hardening, load testing, and compliance controls:** intentionally outside this functional demonstration.

These are explicit follow-up design areas, not silently implemented features. Live Feed’s Redis-backed JTI and opaque-code stores are the current single-use boundary; deployment-scale session coordination remains future hardening.

## License and Third-Party Notes

The project is MIT licensed. Third-party/runtime notes:

- QuestPDF 2026.8.0 is configured for Community licensing; production users must independently verify eligibility and licensing requirements.
- BenchmarkDotNet 0.15.8 is used only by the benchmark project and is MIT licensed.
- The SignalR browser client is a vendored Microsoft runtime asset under its applicable license.
- PostgreSQL, RabbitMQ, and Redis are used through local infrastructure images; their respective licenses apply.

See the [portal README](apps/auction-operations-portal/README.md) for the detailed portal, reporting, observability, and runtime notes.
