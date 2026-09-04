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

| Component | URL/Port |
| --- | --- |
| Laravel client | http://localhost:8000 |
| Bidding API | http://localhost:5000 |
| Live Feed | http://localhost:3001 |
| PostgreSQL | localhost:5432 |
| RabbitMQ AMQP | localhost:5672 |
| RabbitMQ management | http://localhost:15672 |
| Redis | localhost:6379 |

## Current Project Status

Phase 0 foundation is scaffolded. The repository contains initial service shells, infrastructure-only Docker Compose, environment defaults, documentation, and planned worker boundaries. Auction and bid domain logic has intentionally not been implemented yet.

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
