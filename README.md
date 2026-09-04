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

The demo is organized as a monorepo with independently understandable services. The Laravel + React client will call the .NET Bidding Service over HTTP. The Bidding Service will own auction and bid state in PostgreSQL and will persist integration events through a transactional outbox. An outbox publisher will publish durable events to RabbitMQ. Downstream workers and the Live Feed Service will consume those events. The Live Feed Service will use Redis and Socket.IO to broadcast accepted state to connected clients.

## Services

| Service | Path | Technology | Responsibility |
| --- | --- | --- | --- |
| Client | `apps/client` | Laravel 13, React, TypeScript, Vite | Browser application and future auction UI |
| Bidding Service | `apps/bidding-service` | ASP.NET Core Web API on .NET 10 | Authoritative bid validation and auction state |
| Live Feed Service | `apps/live-feed-service` | Node.js, TypeScript, Socket.IO | Real-time fan-out of accepted events |
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
| PostgreSQL | localhost:5432 |
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
| POST | `/api/auctions/{id}/bids` | Baseline bid placement validation and persistence |

The minimum valid bid rule is:

- If there is no accepted bid, `minimumValidBid = StartingPrice`.
- Otherwise, `minimumValidBid = CurrentBidAmount + MinimumBidIncrement`.

All auction timing validation uses server-side UTC. Monetary values use `decimal`. The `Auction.Version` field is configured as an EF Core optimistic concurrency token, but true simultaneous bid conflict handling and retry strategy are planned for Phase 2.

## Current Project Status

Phase 1 is implemented for the Bidding Service. The repository contains the foundation plus PostgreSQL-backed Auction and Bid entities, EF Core migrations, deterministic demo seed data, and a small REST API for auction listing, details, bid history, and baseline bid placement. RabbitMQ publishing, Redis/Socket.IO bid broadcasting, transactional outbox, billing, notifications, and auction scheduling are intentionally not implemented yet.

## Planned Implementation Phases

1. Phase 0: Foundation/infrastructure
2. Phase 1: Bidding domain and PostgreSQL schema
3. Phase 2: Concurrency-safe bid placement
4. Phase 3: Transactional outbox and RabbitMQ publisher
5. Phase 4: Live Feed Service, Redis, and Socket.IO
6. Phase 5: Laravel + React auction UI
7. Phase 6: Auction scheduler
8. Phase 7: Billing and notification workers
9. Phase 8: Integration/demo scenarios
10. Phase 9: Tests, documentation, cleanup, and GitHub presentation



