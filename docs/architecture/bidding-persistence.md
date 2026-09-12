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

## Planned follow-up

The next persistence-boundary work should be small and behavior-preserving:

1. Run scheduler and outbox integration tests against databases created from
   the Bidding Service migrations.
2. Add compatibility assertions for required columns and indexes.
3. Reassess repository grouping only after schema compatibility is protected.
