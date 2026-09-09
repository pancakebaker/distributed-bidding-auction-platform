# Auction Operations Portal

The portal is an independent ASP.NET Core Blazor consumer of the existing `auction.events` exchange. It owns the `auction_activity` projection in the separate `auction_operations` PostgreSQL database and does not update authoritative auction state.

It consumes through the dedicated durable `auction-operations.activity` queue, bound to `auction.bid.accepted`, `auction.closed`, and `auction.winner.selected`. Invalid messages are dead-lettered through `auction-operations.dead-letter` / `auction-operations.activity.dlq`; transient failures are requeued up to the configured limit.

`event_id` is the database-enforced idempotency key. Aggregate versions are observational metadata only: `AuctionClosed` and `WinnerSelected` may both persist at version 16 when their event IDs differ.

Create the local database once if needed:

```sql
CREATE DATABASE auction_operations;
```
