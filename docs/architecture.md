# Architecture

This project demonstrates a distributed bidding architecture with clear service boundaries. It is intentionally functional and educational before it is production hardened.

## Bidding Service Authority

The Bidding Service is authoritative for:

- accepting or rejecting bids
- auction bid state
- minimum bid validation
- auction open/closed validation
- bid ordering and versioning

Other services must not independently decide whether a bid is valid.

## Live Feed Service

The Live Feed Service never decides whether a bid is valid. It only broadcasts accepted state and accepted events that originated from the authoritative Bidding Service. It uses Socket.IO for client connections, and Redis supports fan-out when multiple live feed instances are running.

## RabbitMQ

RabbitMQ carries durable integration events between services. Consumers must be idempotent because at-least-once delivery must be assumed. Duplicate event delivery, redelivery after failures, and out-of-order observations are expected operational realities.

## Transactional Outbox

The business write and event record must commit in the same PostgreSQL database transaction. A background publisher reads pending outbox events and sends them to RabbitMQ. This prevents a successful bid write from being separated from the event that other services need to observe.

## Server Time

Server-side auction state and server time determine whether bids are valid. Browser time is never trusted for auction closure, countdown enforcement, or bid acceptance.

## Service Ownership

The bidding database is not shared directly with billing, catalog, notification, or live feed services. Services communicate through explicit HTTP contracts and integration events rather than reading each other's internal tables.
