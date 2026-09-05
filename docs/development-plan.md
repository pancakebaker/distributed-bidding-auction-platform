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

Publish pending outbox records to RabbitMQ, mark successful deliveries, record publish failures, and keep consumers idempotent.

## Phase 5: Live Feed Service + Redis + Socket.IO

Consume accepted bidding events, fan out updates with Socket.IO, and use Redis to support multiple live feed instances.

## Phase 6: Laravel + React auction UI

Build a minimal user-facing auction experience that can view auctions, place bids, and observe live updates.

## Phase 7: Auction scheduler

Close auctions using server-side time and publish `AuctionClosed` and `WinnerSelected` events.

## Phase 8: Billing and notification workers

Add idempotent worker flows for payment and notification events.

## Phase 9: Integration/demo scenarios, tests, documentation, cleanup, GitHub presentation

Create repeatable demos, polish documentation, prepare diagrams, and shape the repository for a strong GitHub portfolio presentation.
