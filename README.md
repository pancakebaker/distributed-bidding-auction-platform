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

The demo is organized as a monorepo with independently understandable services. The Laravel + React client will call the .NET Bidding Service over HTTP. The Bidding Service owns auction and bid state in PostgreSQL and is the only service that can accept or reject bids. Accepted bid transactions persist a `BidAccepted` outbox message in the same PostgreSQL transaction as the bid and auction update. The outbox publisher drains unpublished rows to RabbitMQ, and the Live Feed Service now consumes accepted bid events, applies Redis-backed idempotency/order protection, and broadcasts frontend-friendly `bid:accepted` messages through Socket.IO. The Laravel/React client now provides the demo auction UI. Later phases will add billing, notifications, and auction scheduling.

## Services

| Service | Path | Technology | Responsibility |
| --- | --- | --- | --- |
| Client | `apps/client` | Laravel 13, React 19, TypeScript, Vite | Auction list/detail UI, bid form, REST integration, and Socket.IO live updates |
| Bidding Service | `apps/bidding-service` | ASP.NET Core Web API on .NET 10 | Authoritative bid validation, auction state, and durable outbox persistence |
| Live Feed Service | `apps/live-feed-service` | Node.js, TypeScript, Express, Socket.IO, Redis, amqplib | Consumes accepted bid events and broadcasts them to subscribed clients |
| Outbox Publisher | `workers/outbox-publisher` | .NET 10 Worker, Npgsql, RabbitMQ.Client | Publishes pending outbox records to RabbitMQ |
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


## Client UI

The Laravel app is the web shell and React owns the auction experience. Browser code calls the Bidding Service REST API directly through `VITE_BIDDING_API_URL` and connects to the Live Feed Service through `VITE_LIVE_FEED_URL`.

Routes:

| Route | Purpose |
| --- | --- |
| `/auctions` | Auction discovery list from `GET /api/auctions` |
| `/auctions/{id}` | Auction detail, bid history, bid form, and live updates |

The client does not duplicate bidding rules. REST command responses from the Bidding Service are authoritative for bid acceptance and validation. Socket.IO is a live projection used to keep multiple browser clients visually synchronized.

The browser defensively ignores live `bid:accepted` events whose `auctionVersion` is less than or equal to the current UI version. This is client-side protection only; PostgreSQL and the Bidding Service remain authoritative. The countdown is also UX-only, and server UTC still decides whether an auction accepts bids.

If the Live Feed Service is offline, the auction page still loads from REST and bids can still be submitted. Reconnecting restores future live updates; a REST refresh reconciles any missed state in this demo phase.

Client environment defaults:

```env
VITE_BIDDING_API_URL=http://localhost:5000
VITE_LIVE_FEED_URL=http://localhost:3001
```

## Quick Demo

1. Start infrastructure: `docker compose up -d`
2. Start the Bidding Service: `dotnet run --project apps/bidding-service/bidding-service.csproj --launch-profile http`
3. Start the Outbox Publisher: `dotnet run --project workers/outbox-publisher/outbox-publisher.csproj`
4. Start the Live Feed Service: `npm run start --prefix apps/live-feed-service`
5. Build or run the client assets: `npm run build --prefix apps/client`
6. Start Laravel: `php artisan serve --host=127.0.0.1 --port=8000` from `apps/client`
7. Open `http://localhost:8000/auctions` in two browser windows.
8. Open the MacBook Pro auction in both windows, choose different demo bidders, and place accepted or stale bids.

Expected demo behavior: accepted REST bids update the submitting browser immediately, then both browser windows converge through the `bid:accepted` live event after the outbox publisher and RabbitMQ path complete.
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

Outbox messages are published by the .NET worker in `workers/outbox-publisher`. The publisher polls unpublished rows in small batches, claims them with PostgreSQL `FOR UPDATE SKIP LOCKED`, publishes to the durable RabbitMQ topic exchange `auction.events`, waits for publisher confirmation, and only then sets `PublishedAtUtc`.

For local verification, the publisher declares a development debug queue named `auction.events.debug` bound with `auction.#`. This queue exists to inspect real messages during demos; it is not a production consumer.

RabbitMQ routing for Phase 4:

| Event | Exchange | Routing key |
| --- | --- | --- |
| BidAccepted | `auction.events` | `auction.bid.accepted` |

Even with publisher confirms, the system is at-least-once. A crash can happen after RabbitMQ accepts a message but before PostgreSQL is marked published, so future consumers must use `eventId` for idempotency. This is intentional and honest: the outbox prevents lost committed events, not duplicate delivery.
## Live Feed Service

The Live Feed Service consumes `BidAccepted` from RabbitMQ using one durable shared queue named `live-feed.bid-events`, bound to `auction.events` with `auction.bid.accepted`. Multiple live-feed instances should share this queue so RabbitMQ load-balances work instead of duplicating every event per instance.

Processing uses manual acknowledgements. Valid messages are ACKed only after validation, Redis idempotency/order checks, and Socket.IO fan-out complete. Malformed messages are NACKed without requeue and routed to the simple development dead-letter queue `live-feed.bid-events.dlq` through `live-feed.dead-letter`. Transient failures are NACKed with requeue.

Redis is used for three live-feed concerns only:

- Socket.IO Redis adapter fan-out across multiple live-feed instances
- demo-level event idempotency with `live-feed:processed-event:{eventId}` and a configurable TTL
- highest observed auction version with `live-feed:auction-version:{auctionId}`

PostgreSQL and the Bidding Service remain authoritative. The live feed never accepts, rejects, reprices, or closes bids. It rejects stale observations by comparing `aggregateVersion`; if a newer version arrives with a gap, it broadcasts the newer authoritative event and logs the gap instead of building a replay engine.

Clients subscribe with `auction:subscribe` and a UUID auction ID. The server constructs rooms as `auction:{auctionId}` and emits:

```json
{
  "auctionId": "auction-id",
  "bidId": "bid-id",
  "bidderId": "alice",
  "amount": 10500,
  "auctionVersion": 42,
  "occurredAtUtc": "2026-09-05T00:00:00Z",
  "correlationId": "request-or-flow-id"
}
```

A developer harness is available from `apps/live-feed-service`:

```powershell
npm run watch:auction -- <auction-id>
```

## Current Project Status

Phase 6 is implemented for the Laravel/React demo UI. The repository contains the foundation plus PostgreSQL-backed Auction and Bid entities, EF Core migrations, deterministic demo seed data, REST endpoints, optimistic concurrency hardening, durable `BidAccepted` outbox persistence, a .NET outbox publisher with RabbitMQ publisher confirms, a Redis/Socket.IO Live Feed Service consumer, and a polished auction list/detail client.

Billing, notifications, auction scheduling, production authentication, account registration, admin auction CRUD, and payment workflows are intentionally not implemented yet.

## Planned Implementation Phases

1. Phase 0: Foundation/infrastructure
2. Phase 1: Bidding domain and PostgreSQL schema
3. Phase 2: Concurrency-safe bid placement
4. Phase 3: Transactional outbox persistence
5. Phase 4: Outbox publisher and RabbitMQ delivery
6. Phase 5: Live Feed Service, Redis, and Socket.IO - implemented
7. Phase 6: Laravel + React auction UI - implemented
8. Phase 7: Auction scheduler
9. Phase 8: Billing and notification workers
10. Phase 9: Integration/demo scenarios, tests, documentation, cleanup, and GitHub presentation

