# Development Plan

## Phase 0: Foundation/infrastructure

Create the monorepo structure, service shells, infrastructure-only Docker Compose, documentation, and boot/build verification.

## Phase 1: Bidding domain + PostgreSQL schema

Implemented: Auction and Bid entities, EF Core DbContext, PostgreSQL migration, deterministic demo seed data, baseline REST endpoints, bid validation rules, and integration-style API tests against PostgreSQL.

## Phase 2: Concurrency-safe bid placement

Implement hardened simultaneous bid handling around the existing optimistic concurrency token. Define retry/conflict behavior, stale bid responses, and database-backed consistency guarantees for competing bid writes.

## Phase 3: Transactional outbox + RabbitMQ publisher

Persist integration events in the same transaction as bidding state changes and publish pending outbox records to RabbitMQ.

## Phase 4: Live Feed Service + Redis + Socket.IO

Consume accepted bidding events, fan out updates with Socket.IO, and use Redis to support multiple live feed instances.

## Phase 5: Laravel + React auction UI

Build a minimal user-facing auction experience that can view auctions, place bids, and observe live updates.

## Phase 6: Auction scheduler

Close auctions using server-side time and publish `AuctionClosed` and `WinnerSelected` events.

## Phase 7: Billing and notification workers

Add idempotent worker flows for payment and notification events.

## Phase 8: Integration/demo scenarios

Create repeatable local demo scenarios that show accepted bids, rejected bids, retries, live updates, and eventual consistency.

## Phase 9: Tests, documentation, cleanup, GitHub presentation

Add focused tests, polish documentation, prepare diagrams, and shape the repository for a strong GitHub portfolio presentation.
