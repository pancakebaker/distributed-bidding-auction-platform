# Bidding Database Ownership and Worker Schema Contract

This document defines the current persistence boundary shared by the Bidding
Service, Auction Scheduler, and Outbox Publisher. It is an architectural
compatibility contract, not a replacement for the EF Core model or migrations.

## Ownership

`apps/bidding-service` is the authoritative owner of BiddingDb. It owns:

- `BiddingDbContext`
- EF Core migrations under `apps/bidding-service/Data/Migrations`
- database schema evolution
- auction persistence
- bid persistence
- the transactional outbox schema

The following are separate deployables that consume this schema:

- `workers/auction-scheduler`
- `workers/outbox-publisher`

Workers do not own or apply migrations. They must not independently redefine
the production schema or change table and column contracts without coordinated
compatibility review.

The current dependency direction is:

```text
bidding-service
  owns BiddingDb and migrations
        |
        +--> auction-scheduler
        |
        +--> outbox-publisher
```

The workers use direct PostgreSQL access intentionally. This preserves the
transactional requirements described below; it is not an accidental shortcut.

## Scheduler schema contract

The scheduler currently reads and writes these tables:

- `auctions`
- `bids`
- `outbox_messages`

It relies on these `auctions` fields:

- `id`
- `status`
- `end_time_utc`
- `current_bid_amount`
- `current_bidder_id`
- `version`
- `updated_at_utc`

It relies on these `bids` fields:

- `id`
- `auction_id`
- `bidder_id`
- `amount`
- `created_at_utc`

For lifecycle event inserts it relies on these `outbox_messages` fields:

- `id`
- `event_type`
- `aggregate_type`
- `aggregate_id`
- `aggregate_version`
- `occurred_at_utc`
- `correlation_id`
- `payload`
- `created_at_utc`

Scheduler compatibility includes the following semantics:

- `status = 'Open'` identifies auctions eligible for closure.
- `end_time_utc` is compared using server UTC time.
- `version` is incremented when an auction is closed and participates in the
  concurrency check.
- The winning bid is selected from the authoritative accepted bid state using
  the current bidder and amount, ordered by creation time and ID.
- Eligible auctions are claimed with PostgreSQL `FOR UPDATE SKIP LOCKED`.
- The auction close, version update, and `AuctionClosed`/`WinnerSelected`
  outbox inserts commit in one PostgreSQL transaction.

The scheduler does not publish directly to RabbitMQ.

## Outbox publisher schema contract

The outbox publisher depends only on `outbox_messages`. It does not read or
write `auctions` or `bids`.

It relies on these fields:

- `id`
- `event_type`
- `aggregate_type`
- `aggregate_id`
- `aggregate_version`
- `occurred_at_utc`
- `correlation_id`
- `payload`
- `created_at_utc`
- `published_at_utc`
- `publish_attempts`
- `last_error`

Required semantics are:

- an unpublished row has `published_at_utc IS NULL`;
- `publish_attempts` participates in retry eligibility;
- competing publishers claim rows with `FOR UPDATE SKIP LOCKED`;
- successful broker publication sets `published_at_utc` and clears the last
  error;
- a failed publication increments `publish_attempts` and records
  `last_error`;
- claiming, publication-state updates, and the final transaction commit retain
  the existing outbox processing semantics.

The publisher consumes the schema owned by the Bidding Service; it does not
own or migrate the outbox table.

## Migration ownership and deployment order

The authoritative migrations are in:

```text
apps/bidding-service/Data/Migrations
```

The Bidding Service may apply them during local or configured startup. The
scheduler and outbox publisher assume that compatible migrations have already
been applied and must not run migrations during startup.

Safe deployment sequencing is:

1. Apply a backward-compatible BiddingDb migration.
2. Deploy services and workers compatible with that schema.
3. Remove deprecated schema only after all consumers no longer depend on it.

This is a compatibility principle rather than a requirement for one particular
deployment tool.

## Current test-schema gap

The Bidding Service integration tests reset their database using the
authoritative EF migrations. The scheduler and outbox publisher integration
tests currently create dedicated PostgreSQL test schemas manually with SQL.

Those worker tests provide valuable behavior coverage, including locking,
concurrency, rollback, retries, and outbox publication. However, duplicating
schema definitions creates drift risk. The current fixtures already differ from
the authoritative model in examples such as:

- different `status` and bidder column lengths;
- a missing authoritative auction status/end-time index in the scheduler
  fixture;
- differing outbox column length/type definitions.

This is why worker compatibility with the latest Bidding Service migrations is
a future test-hardening stage. The intended direction is for worker integration
databases to be created from the authoritative migrations rather than from
independent production-like SQL definitions.

## Compatibility rules

Changes to the BiddingDb schema require coordinated worker review when they
affect any of the following:

- table or column names;
- column removal or incompatible type/length changes;
- `AuctionStatus` string values;
- `Auction.Version` type or increment/concurrency semantics;
- UTC timestamp meaning or timezone handling;
- outbox event, aggregate, payload, or publication-state columns;
- indexes used by scheduler selection or outbox claiming;
- `FOR UPDATE SKIP LOCKED` behavior or transaction visibility;
- auction lifecycle semantics.

Prefer additive, backward-compatible schema evolution. Renaming or destructive
migrations require worker compatibility checks before deployment and should not
be treated as an isolated bidding-service change.

## Why direct database access remains intentional

The scheduler must atomically close an auction, advance its aggregate version,
and persist the corresponding lifecycle outbox events. A simple HTTP API would
not preserve that atomicity unless the Bidding Service owned the entire close
transaction.

The outbox publisher must atomically claim rows, publish them, and record
publication or retry state while coordinating competing publisher instances.
Its locking and transaction behavior is tied directly to the outbox table.

These requirements make the current direct database boundary intentional. A
future API boundary would be a redesign that must preserve these guarantees,
not a mechanical repository split.

## Repository boundary recommendation

For now, keep these components in one repository:

- bidding-service
- auction-scheduler
- outbox-publisher

They remain separate deployables and processes, but they share BiddingDb,
transactional behavior, migration lifecycle, and schema compatibility review.

They may be separated later through an explicit versioned schema contract or a
redesigned service boundary that preserves atomicity. This recommendation does
not prohibit future separation; it avoids creating an unmanaged schema-release
coordination problem prematurely.

## Runtime database privilege boundaries

The Bidding Service, Auction Scheduler, and Outbox Publisher share one
authoritative schema but should not share unrestricted production database
identities. The following are intended runtime boundaries, expressed as a
deployment contract rather than executable grants. A conceptual
`bidding_migrator` identity owns the schema and performs migration/deployment
operations; it is not the normal identity for any runtime worker.

| Identity | `auctions` | `bids` | `outbox_messages` | DDL/migrations |
| --- | --- | --- | --- | --- |
| `bidding_migrator` | ownership-level migration access | ownership-level migration access | ownership-level migration access | apply migrations, create/change schema and indexes |
| `bidding_service` | `SELECT`, `INSERT`, `UPDATE` | `SELECT`, `INSERT` | `INSERT` | none during normal runtime |
| `auction_scheduler` | `SELECT`, `UPDATE` | `SELECT` | `INSERT` | none |
| `outbox_publisher` | none | none | `SELECT`, `UPDATE` | none |

The `bidding_service` boundary reflects the current API and local demo
initializer. API reads select auctions and bids; bid placement updates the
auction, inserts a bid, and inserts a `BidAccepted` outbox row. The service
does not need to read or update outbox rows for its request path. Local demo
seeding also requires the documented auction and bid inserts. Migration and
schema privileges remain separate from these runtime DML privileges.

The scheduler claims eligible auctions with `SELECT ... FOR UPDATE SKIP
LOCKED`, reads the winning bid, updates the auction during close, and inserts
the lifecycle outbox rows. PostgreSQL row locking is part of `SELECT`, so a
separate lock privilege is not required. The scheduler does not need to
insert or delete auctions, modify bids, update or delete outbox rows, or
change schema.

The publisher discovers unpublished rows with `SELECT ... FOR UPDATE SKIP
LOCKED` and updates publication state after RabbitMQ confirmation. `UPDATE`
is required for `published_at_utc`, `publish_attempts`, and `last_error`. It
does not need to insert outbox rows or access auctions and bids. These grants
must preserve the existing ReadCommitted transaction and RabbitMQ
publish/confirm behavior; this documentation does not propose changing either
boundary.

Tables should remain owned by the migration/schema owner. Granting runtime
identities `SELECT`, `INSERT`, or `UPDATE` does not transfer ownership. Keeping
ownership with `bidding_migrator` ensures that future migrations, index changes,
and ownership-level operations remain controlled by the deployment process.

The repository currently uses the broad local PostgreSQL role `auction_app`
for the Bidding Service, both workers, Docker Compose, and integration tests.
That is a development convenience, not the intended production
least-privilege model. D2.4 does not create roles, grants, credentials, secret
files, or connection-string changes. The conceptual role names above describe
the target deployment architecture only.

Disposable integration-test environments may continue using a broader
identity because the tests create and drop isolated databases and apply
migrations as part of compatibility and behavior verification. A future
deployment-focused integration test can validate reduced runtime grants
separately without changing the disposable test setup.

These explicit database contracts also make future repository separation
safer: each deployable has a visible persistence boundary, and accidental
schema access is easier to detect than with shared unrestricted credentials.
For now, the Bidding Service, Scheduler, and Publisher remain grouped because
they share BiddingDb, migration lifecycle, and transaction-sensitive
persistence behavior.

For schema changes, the conceptual deployment sequence remains:

1. Apply a backward-compatible migration with `bidding_migrator`.
2. Verify compatibility with the currently deployed service and workers.
3. Deploy runtime services using their DML-only identities.
4. Remove deprecated schema only in a later compatible release.

This additive, backward-compatible sequence allows service and worker versions
to overlap safely while a migration is being rolled out. It does not add
executable deployment automation.

## Buy Now command contract

Buy Now is an explicit command exposed by the Bidding Service at:

```text
POST /api/auctions/{id}/buy-now
```

The request identifies the buyer but does not submit a price. The service reads
the authoritative `BuyNowPrice` from BiddingDb. A bid at or above
`BuyNowPrice` never means Buy Now and is rejected as an ordinary bid.

The command is eligible only for `BuyNowOnly` and `AuctionAndBuyNow` auctions
that are open, started, unexpired, correctly priced, and not already in a
terminal outcome. A successful command closes the auction atomically, writes
`FinalWinnerId` and `FinalPrice`, increments `Version` once, and persists
`AuctionPurchased` followed by `AuctionClosed` in the transactional outbox.
Both events use the same resulting aggregate version. `WinnerSelected` is not
emitted for Buy Now, and no synthetic `Bid` is created.

`CurrentBidAmount` and `CurrentBidderId` remain the highest ordinary-bid state;
`FinalPrice` and `FinalWinnerId` remain the terminal auction outcome. This
separation is required for accurate bid history and for concurrent Buy Now,
ordinary-bid, and scheduler transitions.

### BN6 API and identity contract

The current request shape is:

```http
POST /api/auctions/{id}/buy-now
Content-Type: application/json

{ "bidderId": "buyer-123" }
```

The bidder identity is a transitional demo contract because this repository
does not currently authenticate a principal at the Bidding Service. The API
resolves identity through one boundary: an authenticated principal, when one
exists, takes precedence; otherwise the trimmed request identity is retained
for local/demo use. The request cannot supply a price, final winner, or terminal
state. A future authentication integration should replace only this resolver,
not endpoint business rules.

`BuyNowPrice` is always read from PostgreSQL. Supported modes are
`BuyNowOnly` and `AuctionAndBuyNow`; `AuctionOnly` rejects the command. Success
returns `201 Created` with the committed auction ID, buyer ID, final price,
version, purchase time, and correlation ID. A duplicate submission is safe at
the state-transition level: the first request closes the auction and writes one
purchase plus one close event; a later request reloads the closed state and
returns a domain conflict. Request-level idempotency keys are not currently
provided.

Stable API error codes include `invalid_bidder`, `auction_not_found`,
`auction_not_started`, `auction_ended`, `auction_not_open`,
`buy_now_not_available`, `auction_concurrency_conflict`,
`bidding_not_available`, and `bid_at_or_above_buy_now_price`. Ordinary bids at
or above `BuyNowPrice` never trigger a purchase. The server remains authoritative
for mode, price, identity, state, and concurrency outcomes.

No authentication or authorization middleware currently reaches these command
endpoints, and neither is an admin-only route. The temporary request identity
must therefore be treated as non-authoritative/demo-only until an established
authentication system is integrated. Logs use structured identifiers and do
not record tokens or full request bodies.

## Buy Now event and scheduler semantics

A successful Buy Now transition produces `AuctionPurchased` with routing key
`auction.purchased`, followed by `AuctionClosed`. Both outbox messages describe
one atomic aggregate transition, use the same resulting aggregate version and
correlation ID, and retain distinct event IDs. `WinnerSelected` is reserved for
an ordinary auction winner derived from accepted `Bid` history.

Expiry scheduling claims only open auctions whose end time has passed. A
purchased auction is already closed, so the scheduler never reclaims it,
increments its version again, or emits duplicate lifecycle events. An unsold
`BuyNowOnly` auction closes on expiry without `WinnerSelected`; an
`AuctionAndBuyNow` auction that expires without purchase follows the ordinary
bid-history path, emitting `WinnerSelected` only when a valid winning bid
exists.

## Auction management API (AM1)

The Bidding Service is the authoritative write owner for auction creation and
configuration. Admin applications and future clients call the management API;
they do not write BiddingDb directly. AM1 exposes:

```text
POST   /api/auctions
PUT    /api/auctions/{id}
DELETE /api/auctions/{id}
```

Create derives lifecycle state from the server clock: a future start creates a
`Scheduled` auction and a started, unexpired window creates an `Open` auction.
Expired windows and invalid money/time/sale-mode combinations are rejected.
The API never accepts status, version, current bid, final outcome, or audit
timestamps from the caller.

Sale-mode configuration remains authoritative as follows:

- `AuctionOnly` requires a positive starting price and increment and no
  `BuyNowPrice`.
- `BuyNowOnly` requires a positive `BuyNowPrice`. Because `StartingPrice` is
  still non-null in persistence, it is normalized to `BuyNowPrice`; that value
  is compatibility data, not the purchase-price authority. The increment is a
  required positive schema value but has no bidding meaning in this mode.
- `AuctionAndBuyNow` requires a positive starting price and increment and a
  `BuyNowPrice` strictly greater than the starting price.

Only future, untouched `Scheduled` auctions are editable. Their expected
`Version` is required, and a successful update increments it exactly once.
`Open`, `Closed`, and `Cancelled` auctions are immutable in AM1; an auction
whose persisted status is stale relative to its start time is treated as
started and is not edited. There is no generic patch/overposting path.

Management failures use the stable codes `invalid_sale_mode_configuration`,
`invalid_auction_time_window`, `invalid_starting_price`,
`invalid_bid_increment`, `invalid_buy_now_price`, `auction_not_found`,
`auction_already_started`, `auction_not_editable`, `auction_not_deletable`,
and `auction_concurrency_conflict` as applicable.

`DELETE` is intentionally narrow: it physically removes only a future,
untouched `Scheduled` auction with no bids, terminal outcome, or outbox history.
Open, bid-bearing, closed, cancelled, or purchased auctions return
`auction_not_deletable`. AM1 does not introduce a cancellation endpoint or
`AuctionCancelled` event; explicit cancellation semantics and lifecycle-event
propagation remain future work. This preserves historical and outbox integrity
and ensures the expiry scheduler never sees a deleted or cancelled auction.

Management APIs currently have no authentication or authorization middleware in
the Bidding Service. They are therefore a local/demo management boundary, not
an assertion of production administrative security. A future established admin
principal should protect these routes without changing the explicit field and
version rules. AM2 will provide the admin UI and must call these APIs rather
than accessing the database.

### BN6 deployment, rollback, and recovery

The platform boundary is intentional: commands use HTTP; durable auction state
lives in PostgreSQL; integration events flow through the transactional outbox;
RabbitMQ transports them; Redis/live-feed provides projections and realtime UX;
and HTTP read state remains the browser recovery authority when a live event is
missed.

Deploy Buy Now in this order: apply the additive, backward-compatible database
migration; deploy the Bidding Service and workers that understand the new
nullable fields and events; deploy the outbox publisher; deploy live-feed and
Operations Portal consumers before enabling event production; then expose the
Laravel/React client behavior. Consumers must understand `AuctionPurchased`
before a producer can emit it. Existing consumers may safely continue to read
the added nullable fields, but an old consumer that rejects the new event is a
degraded/unsafe deployment for purchase activity and must be upgraded first.

Keeping the new columns after a service rollback is safe and is preferred to
running a destructive down migration in production. An older service can read
the additive fields without using them; an older live consumer may lose
purchase activity if it cannot recognize the event; a new client against an
old backend is degraded because purchase capability is unavailable. The
transactional outbox remains the compatibility boundary, and same-version
sibling events still require event-ID deduplication rather than version-only
rejection.

The existing BN1 migration backfills historical rows to `AuctionOnly`, leaves
`BuyNowPrice`, `FinalWinnerId`, and `FinalPrice` null, preserves `numeric(18,2)`
money precision, and adds a static sale-mode check. It has no new runtime
indexes or payment state. Production rollback should retain these columns and
constraints; migration `Down` is a development/test rollback mechanism, not a
data-preserving production rollback plan.

Buy Now eligibility is `StartTimeUtc <= now < EndTimeUtc`; the exact end instant
is rejected, matching expiry scheduling. .NET `decimal` and PostgreSQL
`numeric(18,2)` remain authoritative. JavaScript/Redis values are display and
projection representations only and must never become the price authority.

## Planned follow-up

The next persistence-boundary work should be small and behavior-preserving:

1. Run scheduler and outbox integration tests against databases created from
   the Bidding Service migrations.
2. Add compatibility assertions for required columns and indexes.
3. Reassess repository grouping only after schema compatibility is protected.
