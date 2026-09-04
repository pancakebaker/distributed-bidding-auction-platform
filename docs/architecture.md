# Architecture

This project demonstrates a distributed bidding architecture with clear service boundaries. It is intentionally functional and educational before it is production hardened.

## Bidding Service Authority

The Bidding Service is authoritative for:

- accepting or rejecting bids
- auction bid state
- minimum bid validation
- auction open/closed validation
- bid ordering and versioning

Other services must not independently decide whether a bid is valid. PostgreSQL state owned by the Bidding Service is the authority for accepted bid history and current auction state.

## Concurrency-Safe Bidding

`Auction.Version` is configured as an EF Core optimistic concurrency token and is monotonic. Every accepted bid advances the auction version exactly once; rejected bids and failed concurrency attempts do not advance it.

Bid placement uses a bounded retry strategy. Each attempt re-reads the auction row, validates the bid against server UTC and current PostgreSQL state, inserts one bid row, updates the auction current bid fields, increments the version, and commits in a single database transaction.

If another transaction updates the same auction first, EF Core detects the stale version through the database update condition. The service rolls back, clears tracked state, re-reads the current auction, and re-runs all bid rules. A bid that became stale after another accepted bid receives the normal minimum-bid error. A bid that continues to encounter write conflicts after the bounded retry limit receives a clear concurrency-conflict response.

This is the Phase 2 simultaneous bid strategy. It is intentionally simple for the demo: PostgreSQL arbitrates writes, the Bidding Service remains authoritative, and retries are bounded to avoid unbounded request time.

## Live Feed Service

The Live Feed Service never decides whether a bid is valid. It only broadcasts accepted state and accepted events that originated from the authoritative Bidding Service. It uses Socket.IO for client connections, and Redis supports fan-out when multiple live feed instances are running.

Later events will carry the Bidding Service auction version as `aggregateVersion` so real-time consumers can detect stale or out-of-order observations.

## RabbitMQ

RabbitMQ carries durable integration events between services. Consumers must be idempotent because at-least-once delivery must be assumed. Duplicate event delivery, redelivery after failures, and out-of-order observations are expected operational realities.

RabbitMQ publishing is not implemented yet.

## Transactional Outbox

The business write and event record must commit in the same PostgreSQL database transaction. A background publisher reads pending outbox events and sends them to RabbitMQ. This prevents a successful bid write from being separated from the event that other services need to observe.

The transactional outbox is planned for Phase 3 and is not implemented yet.

## Server Time

Server-side auction state and server time determine whether bids are valid. Browser time is never trusted for auction closure, countdown enforcement, or bid acceptance.

## Service Ownership

The bidding database is not shared directly with billing, catalog, notification, or live feed services. Services communicate through explicit HTTP contracts and integration events rather than reading each other's internal tables.

## Implementation Notes

The Bidding Service owns Auction and Bid state in PostgreSQL through EF Core and Npgsql. Money is represented with `decimal` and mapped with fixed precision. Auction validity is evaluated with server-side UTC through .NET `TimeProvider`; browser/client time is not trusted.

No RabbitMQ events, Redis fan-out, Socket.IO bid broadcasts, transactional outbox records, billing workflows, notification workflows, or auction scheduler behavior are implemented through Phase 2.
