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

After validation, the portal stores only minimized identity claims in its own short-lived HttpOnly cookie (`auction_operations_auth`). Logout clears that cookie and returns to the configured Laravel admin URL. The configured Laravel base URL is deployment metadata only; logout does not accept a user-controlled redirect. The current in-memory JTI replay guard is intentionally single-instance; a multi-instance deployment must move consumed-JTI storage to a shared store before scaling out. Laravel remains the only username/password authority.

## Live activity

The protected `/activity/live` page uses the authenticated `/hubs/activity` ASP.NET Core SignalR hub for best-effort server-to-browser notifications. The RabbitMQ consumer validates and persists an event before publishing a safe `ActivityNotification` projection; only then is the RabbitMQ message acknowledged. A transient SignalR failure is logged and does not undo the durable `auction_activity` row or requeue an already-persisted event. The browser client runtime is vendored at `wwwroot/lib/signalr.min.js` from `@microsoft/signalr` 10.0.0 so local development does not depend on a CDN.

The page loads at most 100 recent rows from PostgreSQL on startup and after SignalR reconnect. Client state is bounded and deduplicated by `EventId`, so reconnect reconciliation does not duplicate rows. `AggregateVersion` is not a deduplication key: `AuctionClosed` and `WinnerSelected` at the same version remain separate when their event IDs differ. The current live fan-out uses the existing single portal instance; distributed live fan-out is a later deployment concern.

## Activity history

The protected `/activity/history` page queries the portal-owned `auction_activity` projection. It supports UTC `from`/`to` timestamps, exact aggregate ID, known event type, page number, and page size (`25`, `50`, or `100`). The maximum range is 31 days; `From` must not be later than `To`. Filter and pagination state is preserved in the URL, for example `/activity/history?from=...&to=...&eventType=BidAccepted&page=2`.

History uses server-side `AsNoTracking` projection, database-side filtering, and offset pagination. Results are ordered deterministically by `occurred_at_utc DESC, id DESC`, with same-version sibling events retained independently. The existing occurred-time, aggregate-ID, and event-type indexes support the bounded query shapes; no additional migration was needed. PostgreSQL remains the durable source of truth, and history does not read or mutate Bidding Service state.
