# Distributed Bidding Auction Platform

Distributed Bidding Auction Platform is a functional distributed-system demonstration intended to explore:

- concurrency-safe bid processing
- transactional outbox
- RabbitMQ event delivery
- Redis/Socket.IO real-time fan-out
- idempotent consumers
- auction scheduling
- service ownership boundaries
- eventual consistency
- failure/retry behavior

This repository is a functional architecture demonstration and is not currently intended to be a production-ready auction platform.

## Architecture Overview

The demo is organized as a monorepo with independently understandable services. The Laravel + React client will call the .NET Bidding Service over HTTP. The Bidding Service owns auction and bid state in PostgreSQL and is the only service that can accept or reject bids. Accepted bid transactions now persist a `BidAccepted` outbox message in the same PostgreSQL transaction as the bid and auction update. Later phases will add RabbitMQ publishing, Redis-backed Socket.IO fan-out, billing, notifications, and auction scheduling.

## Services

| Service | Path | Technology | Responsibility |
| --- | --- | --- | --- |
| Client | `apps/client` | Laravel 13, React, TypeScript, Vite | Browser application and future auction UI |
| Bidding Service | `apps/bidding-service` | ASP.NET Core Web API on .NET 10 | Authoritative bid validation, auction state, and durable outbox persistence |
| Live Feed Service | `apps/live-feed-service` | Node.js, TypeScript, Socket.IO | Future real-time fan-out of accepted events |
| Outbox Publisher | `workers/outbox-publisher` | Planned | Publishes pending outbox records to RabbitMQ |
| Billing Worker | `workers/billing-worker` | Planned | Handles payment-oriented integration events |
| Notification Worker | `workers/notification-worker` | Planned | Sends user-facing notifications |
| Auction Scheduler | `workers/auction-scheduler` | Planned | Emits closure and winner-selection events |

## Prerequisites

- Git
- Docker and Docker Compose
- .NET 8 LTS or newer supported LTS
- PHP 8.3 or newer
- Composer
- Node.js current supported/LTS
- npm

## Repository Structure

```text
apps/
  client/
  bidding-service/
  live-feed-service/
workers/
  outbox-publisher/
  billing-worker/
  notification-worker/
  auction-scheduler/
infrastructure/
  docker/
docs/
docker-compose.yml
.env.example
.gitignore
README.md
LICENSE
```

## Local Infrastructure Startup

Create a local `.env` from `.env.example` if you want to override defaults, then start infrastructure:

```powershell
docker compose up -d
```

Validate the Compose file:

```powershell
docker compose config
```

## Expected Ports

If another local PostgreSQL instance already uses port `5432`, set `POSTGRES_PORT=55432` in the ignored root `.env` file and point the Bidding Service local connection string at port `55432`.

| Component | URL/Port |
| --- | --- |
| Laravel client | http://localhost:8000 |
| Bidding API | http://localhost:5000 |
| Live Feed | http://localhost:3001 |
| PostgreSQL | localhost:5432, or localhost:55432 when overridden locally |
| RabbitMQ AMQP | localhost:5672 |
| RabbitMQ management | http://localhost:15672 |
| Redis | localhost:6379 |

## Bidding API Endpoints

The Bidding Service currently exposes:

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Service health check |
| GET | `/api/auctions` | Auction summary list |
| GET | `/api/auctions/{id}` | Auction detail and current bid state |
| GET | `/api/auctions/{id}/bids` | Bid history, newest first |
| POST | `/api/auctions/{id}/bids` | Concurrency-safe bid placement validation and persistence |

The minimum valid bid rule is:

- If there is no accepted bid, `minimumValidBid = StartingPrice`.
- Otherwise, `minimumValidBid = CurrentBidAmount + MinimumBidIncrement`.

All auction timing validation uses server-side UTC through .NET `TimeProvider`. Monetary values use `decimal` and fixed database precision.

## Bid Concurrency Strategy

`Auction.Version` is a monotonic EF Core optimistic concurrency token. Each accepted bid increments the version exactly once. Rejected bids and failed concurrency attempts do not increment the version.

Bid placement runs in one database transaction per attempt. The service inserts the `Bid`, updates the auction current bid fields, increments `Auction.Version`, creates one `BidAccepted` outbox message, and commits atomically. EF Core includes the original version in the auction `UPDATE`; when another bid has already advanced the row, PostgreSQL reports zero affected auction rows and EF raises a concurrency exception.

The API uses bounded automatic retry for this demo. On a concurrency conflict it rolls back, clears tracked state, re-reads the authoritative auction row, and re-runs all bid rules against the latest server-side state. If the bid is now below the current minimum, the client receives the normal `bid_below_minimum` response. If retry attempts are exhausted, the client receives `auction_concurrency_conflict` with current auction details where available.

## Transactional Outbox

Direct RabbitMQ publishing inside the bid request is intentionally avoided. A request could commit the bid but fail before publishing, or publish a message and then fail to commit the database transaction. The transactional outbox solves that atomicity problem by storing the event intent in PostgreSQL with the business change.

Current accepted bid flow:

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

For Phase 3, only `BidAccepted` messages are persisted. Outbox payloads are explicit JSON contracts stored as PostgreSQL `jsonb`, not serialized EF entities. `CorrelationId` comes from `X-Correlation-ID` when provided, otherwise the API generates a GUID and echoes it in the response header/body. `AggregateVersion` equals the resulting `Auction.Version`, which later consumers can use to reject stale observations.

Outbox messages are currently persisted but not published. `PublishedAtUtc` remains `NULL` until a future publisher handles delivery.

## Current Project Status

Phase 3 is implemented for the Bidding Service. The repository contains the foundation plus PostgreSQL-backed Auction and Bid entities, EF Core migrations, deterministic demo seed data, REST endpoints, optimistic concurrency hardening, bounded retry, durable `BidAccepted` outbox persistence, and PostgreSQL-backed API/concurrency/outbox tests.

RabbitMQ publishing, Redis/Socket.IO bid broadcasting, billing, notifications, and auction scheduling are intentionally not implemented yet.

## Planned Implementation Phases

1. Phase 0: Foundation/infrastructure
2. Phase 1: Bidding domain and PostgreSQL schema
3. Phase 2: Concurrency-safe bid placement
4. Phase 3: Transactional outbox persistence
5. Phase 4: Outbox publisher and RabbitMQ delivery
6. Phase 5: Live Feed Service, Redis, and Socket.IO
7. Phase 6: Laravel + React auction UI
8. Phase 7: Auction scheduler
9. Phase 8: Billing and notification workers
10. Phase 9: Integration/demo scenarios, tests, documentation, cleanup, and GitHub presentation
