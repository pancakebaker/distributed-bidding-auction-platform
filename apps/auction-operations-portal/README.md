# Auction Operations Portal

The portal is an independent ASP.NET Core Blazor consumer of the existing `auction.events` exchange. It owns the `auction_activity` projection in the separate `auction_operations` PostgreSQL database and does not update authoritative auction state.

It consumes through the dedicated durable `auction-operations.activity` queue, bound to `auction.bid.accepted`, `auction.closed`, and `auction.winner.selected`. Invalid messages are dead-lettered through `auction-operations.dead-letter` / `auction-operations.activity.dlq`; transient failures are requeued up to the configured limit.

`event_id` is the database-enforced idempotency key. Aggregate versions are observational metadata only: `AuctionClosed` and `WinnerSelected` may both persist at version 16 when their event IDs differ.

Create the local database once if needed:

```sql
CREATE DATABASE auction_operations;
```

## Authentication boundary

Laravel remains the username/password and administrator authority. The protected Laravel route `/admin/auction-operations` renders a one-time auto-submitting POST handoff to `/auth/handoff`; it never places the JWT in browser storage or a long-lived URL. Laravel signs the short-lived RS256 token with the existing Live Feed private key. The portal reads only the corresponding public key from `../live-feed-service/config/live-feed-admin-public.pem` and requires the exact issuer `auction-client`, audience `auction-operations-portal`, administrator role, `access-auction-operations` permission, expiry, and JTI.

After validation, the portal stores only minimized identity claims in its own short-lived HttpOnly cookie (`auction_operations_auth`). Logout clears that cookie and returns to the configured Laravel admin URL. The configured Laravel base URL is deployment metadata only; logout does not accept a user-controlled redirect. The current in-memory JTI replay guard is intentionally single-instance; a multi-instance deployment must move consumed-JTI storage to a shared store before scaling out. The portal shell is therefore authenticated, but this phase does not add activity UI, SignalR, or any independent user/password system.
