# Development Plan

## Phase 0: Foundation/infrastructure

Implemented: monorepo structure, service shells, infrastructure-only Docker Compose, documentation, and boot/build verification.

## Phase 1: Bidding domain + PostgreSQL schema

Implemented: Auction and Bid entities, EF Core DbContext, PostgreSQL migration, deterministic demo seed data, baseline REST endpoints, bid validation rules, and integration-style API tests against PostgreSQL.

## Phase 2: Concurrency-safe bid placement

Implemented: EF Core optimistic concurrency around `Auction.Version`, atomic bid insert plus auction update transactions, bounded retry on stale auction writes, full bid-rule revalidation after conflicts, structured concurrency/minimum-bid responses, and PostgreSQL-backed concurrent request tests.

## Phase 3: Transactional outbox persistence

Implemented: `OutboxMessage` entity/table, `BidAccepted` event payload contract, same-transaction outbox persistence for accepted bids, correlation ID capture, unpublished message state, and PostgreSQL-backed outbox/concurrency tests.

## Phase 4: Outbox publisher + RabbitMQ delivery

Implemented: separate .NET outbox publisher worker, PostgreSQL `FOR UPDATE SKIP LOCKED` batch claiming, RabbitMQ durable topic exchange, `BidAccepted` routing, publisher confirms, publish-attempt/error tracking, development debug queue, and RabbitMQ/PostgreSQL integration tests.

## Phase 5: Live Feed Service + Redis + Socket.IO

Implemented: RabbitMQ `BidAccepted` consumer, durable shared live-feed queue, manual ACK/NACK handling with a simple DLQ, Redis `eventId` idempotency, Redis `aggregateVersion` stale-event protection, Socket.IO auction rooms, Redis adapter fan-out support, and integration tests against local RabbitMQ/Redis.

## Phase 6: Laravel + React auction UI

Implemented: Laravel routes for the React app shell, auction list/detail screens, direct REST integration with the Bidding Service, demo bidder selector, bid validation/error handling, Socket.IO live updates, client-side auction version protection, responsive styling, and Vitest/Testing Library coverage.

## Phase 7: Auction scheduler

Implemented: separate .NET scheduler worker, server-UTC closure checks, PostgreSQL `FOR UPDATE SKIP LOCKED` row claiming, atomic auction close plus lifecycle outbox transaction, no-bid closure handling, `AuctionClosed` and `WinnerSelected` event payloads, duplicate-pass protection, and PostgreSQL-backed scheduler tests.

## Phase 8: Real-time auction lifecycle

Implemented: Live Feed Service consumption for `AuctionClosed` and `WinnerSelected`, same-version sibling event handling, Socket.IO `auction:closed` and `winner:selected` broadcasts, React closed/winner UI state, no-bid closure display, and REST reconciliation for missed live lifecycle events.

## Phase 9: Portfolio/demo hardening

Implemented: root .NET solution, reviewer startup/reset scripts, README portfolio rewrite, local Mermaid architecture diagram, demo walkthrough, failure-scenario documentation, dependency-audit notes, and clean build/test verification.

## Phase 10: Billing and notification workers

Add idempotent worker flows for payment and notification events.

## Phase 11: Integration/demo scenarios, tests, documentation, cleanup, GitHub presentation

Continue polishing diagrams, evidence, and repository presentation after the remaining planned workers are implemented.
