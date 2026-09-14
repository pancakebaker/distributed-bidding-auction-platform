# Distributed Bidding Integration Contracts

This is the canonical ownership and compatibility policy for the integration
surface. Event detail is in [`docs/event-catalog.md`](../../docs/event-catalog.md),
system topology is in [`docs/architecture.md`](../../docs/architecture.md), and
Buy Now semantics are in [`docs/buy-now-architecture.md`](../../docs/buy-now-architecture.md).

This documents the current monorepo and future split boundaries. It does not
extract, publish, or generate a package.

## Purpose

This project defines stable wire-level identifiers used across the distributed
bidding platform's service boundaries. It prevents producers and consumers from
independently duplicating correctness-sensitive protocol strings. It is the
contract boundary shared by the Bidding Service, outbox publisher, scheduler
where applicable, live-feed service, Operations Portal, and future external
clients/services.

This is a deliberately small contract project, not a general-purpose shared
utilities library.

## Contract categories and authority

| Surface | Authority | Consumer/owner rule |
| --- | --- | --- |
| Event names, aggregate types, routing keys | `contracts/integration-contracts` | Producers own meaning; consumers validate and project. |
| Event payloads and envelope population | Producing service | The shared project does not own domain decisions or persistence. |
| Bidding REST API | Bidding Service | Laravel is the tenant-bound BFF; Operations Portal uses protected system APIs. |
| Authentication and assertion claims | `contracts/auth-contracts` plus issuer | Claims are verified at the boundary; browser values are never authority. |
| RabbitMQ exchange, queues, retry/DLQ | Deployment and consuming services | Routing-key compatibility is required; topology is not domain authority. |
| Live Feed Socket.IO events and rooms | Live Feed | Public state is a projection of trusted Bidding events. |
| Redis projections and idempotency keys | Live Feed | Internal delivery state only; never Tenant or price authority. |
| Operations activity/history/report DTOs | Operations Portal | Local observer models; never producer contracts. |
| PostgreSQL schemas | Owning service | No service reads another service's tables. |
| Environment/configuration | Deployment and each service | Names and required/optional behavior are documented; secrets are not. |

The authoritative data path is Bidding domain and PostgreSQL state ->
transactional outbox -> publisher/RabbitMQ -> consumer-owned projections or UI.
An integration contract carries a fact; it does not transfer write authority.

## Current contracts

The following values are part of the integration protocol and should not be
casually renamed:

### Event types

- `BidAccepted`
- `AuctionClosed`
- `WinnerSelected`
- `AuctionPurchased`
- `AuctionCancelled`
- `TenantStatusChanged`

### Aggregate type

- `Auction`
- `Tenant`

### RabbitMQ routing keys

- `auction.bid.accepted`
- `auction.closed`
- `auction.winner.selected`
- `auction.purchased`
- `auction.cancelled`
- `tenant.status.changed`

The RabbitMQ exchange name, `auction.events`, is deliberately not owned here.
It remains deployment and service configuration because environments may
override it.

## Ownership

The contract is not owned by the bidding service, scheduler, outbox publisher,
or Operations Portal individually. It represents the protocol boundary between
producers and consumers:

- the bidding service produces `BidAccepted`, `AuctionPurchased`, and
  `AuctionCancelled`;
- the scheduler produces `AuctionClosed` and `WinnerSelected`;
- the outbox publisher transports those events;
- the Operations Portal and live-feed service consume them.

`TenantStatusChanged` is produced only by Bidding's authoritative
SystemAdministrator lifecycle command. Its payload carries an immutable event
ID, tenant ID, previous/current status strings, the newly committed monotonic
tenant version, and UTC occurrence time. Future consumers must use the tenant
version to reject stale delivery; the event is a durable notification, not a
replacement for Bidding's authoritative tenant state.

The contract defines what these messages are called on the wire. Application
services still own when events are produced, payload creation, persistence,
business logic, and message handling.

Integration contracts are external messages, not domain entities. The Bidding
Service remains authoritative for auction state; consumers must not infer write
authority from a shared event contract.

`AuctionPurchased` is the explicit Buy Now event. Its authoritative payload is
the auction ID, buyer/bidder ID, and final price; envelope fields carry the
event ID, occurrence time, correlation ID, aggregate ID/type, and aggregate
version. It uses `auction.purchased`. `AuctionPurchased` and `AuctionClosed`
describe one atomic terminal transition, share the resulting aggregate
version, and have distinct event IDs. Consumers must ignore lower versions,
ignore duplicate event IDs, and accept a new event ID at an equal version as a
valid sibling regardless of sibling delivery order.

`AuctionCancelled` represents an explicit lifecycle cancellation, not a bid or
sale. Its payload contains the auction ID; envelope fields carry the resulting
aggregate version, occurrence time, correlation ID, and unique event ID. It
uses `auction.cancelled` and must not be interpreted as `AuctionClosed`.

## Tenant field

Every auction integration-event payload carries a required `tenantId` UUID.
The Bidding Service or scheduler derives it from the authoritative Auction
ownership field; consumers must validate it before projection. This field is
resource ownership metadata, not a human `sub`, client/application identity,
or authorization substitute. RabbitMQ routing keys remain event-type based;
tenant isolation is applied by consumers and projections.

Application identity is a separate concern: `client_id` identifies a registered
calling application and is distinct from both `tenantId` and the human `sub`.
MT5.1 and MT5.2 add the registry and public-key credential foundation, but do
not add client credentials to event payloads or enforce application admission.
Client-held assertions are an application-authentication boundary and must not
be confused with the tenant field carried by these events. Their HTTP
admission is controlled by the temporary MT5.3d rollout gate below.

The MT5.3a validation foundation uses an RS256 JWT with `iss = client_id`, a
credential-selecting `kid`, canonical `tenant_id`, a short bounded lifetime,
and a required `jti`. It validates application proof without changing event
contracts or enabling HTTP admission. MT5.3b adds reusable, atomic Redis
consumption of validated application-scoped JTIs with bounded expiry and
fail-closed storage errors; replay protection is still not wired into HTTP
admission. MT5.3c adds optional Laravel server-side issuance and the
`X-Client-Assertion` outbound header. The Bidding Service now recognizes the
header on its tenant-facing auction route group only when the temporary
`ClientAssertionAdmission:Enabled` rollout gate is enabled; it consumes the
validated JTI once and requires agreement with the bearer/read-token tenant.
Existing permissions and resource ownership checks remain required. Disabled
mode preserves legacy behavior during migration, while Laravel fails closed
when its opt-in signing configuration is invalid. The header carries a fresh RS256 assertion with
`kid`, `iss = client_id`, `aud = dbap-bidding-service`, `tenant_id`, `jti`,
`iat`, `nbf`, and `exp`. Human `Authorization` tokens remain separate. Generic
401/403/503 responses cover invalid proof, tenant disagreement, and replay-store
outage respectively; `/health` and system-administration surfaces are not
covered by this gate.

MT5.4 documents the controlled bootstrap workflow. An operator runs the
Bidding Service's internal `provision` command with a public key PEM and the
registered `client_id`/`kid`; the command reuses the service-owned provisioning
boundary and never receives a private key. Laravel keeps the matching private
key in a mounted server-side file and remains the only assertion issuer. The
operator enables `ClientAssertionAdmission__Enabled=true` only after a fresh
assertion smoke test and keeps the default false during migration. Rotation
provisions a new public credential before switching Laravel's `KeyId`, then
revokes the old credential after overlap is verified. There is still no public
provisioning endpoint, browser credential flow, WordPress implementation, or
later rollout activation in this contract phase.

## What belongs here

Add a value only when multiple independently deployed components must agree on
its exact value. Appropriate examples include:

- stable event discriminator names;
- stable aggregate discriminator names; and
- stable routing-key identifiers shared by producers and consumers.

## What does not belong here

This project must not become a generic `shared` library. It does not own:

- deployment-specific configuration;
- environment-configurable RabbitMQ exchange names;
- queue or dead-letter queue names;
- RabbitMQ hosts, ports, credentials, or virtual hosts;
- service URLs or connection configuration;
- Redis key prefixes unless they become an explicit cross-service protocol;
- Socket.IO events owned by the live-feed boundary;
- authentication or cookie identifiers;
- UI labels or other user-facing text;
- retry settings;
- helper methods or service implementations;
- database models; or
- application DTOs unrelated to the integration protocol.

## Current monorepo usage

The .NET services currently reference this project with `ProjectReference`:

```text
contracts/integration-contracts
            ^
            |
    +-------+--------+----------------+
    |                |                |
bidding-service  auction-scheduler  outbox-publisher  auction-operations-portal
```

The dependency direction is one-way. The contract project must never depend on
an application or infrastructure project.

## TypeScript counterpart

The live-feed service maintains its TypeScript-side definitions independently
in:

- `apps/live-feed-service/src/domain/events.ts`
- `apps/live-feed-service/src/domain/transport.ts`

Those definitions must remain aligned with the exact .NET wire values. The
repository currently uses language-specific contract tests to guard that
alignment; C# and TypeScript do not yet share a generated source of truth.

## Future repository separation

If services move into separate Git repositories, do not copy this source into
each repository. Prefer this evolution:

1. Stabilize the current monorepo contract and its compatibility tests.
2. Extract the contract project into its own repository and package lifecycle.
3. Publish `DistributedBidding.IntegrationContracts` as a versioned NuGet
   package, and provide a generated/versioned or schema-derived artifact for
   TypeScript consumers.
4. Replace monorepo `ProjectReference` dependencies with explicit package
   versions in each service repository.
5. Upgrade consumers deliberately; never maintain copied source contracts.

Conceptually:

```text
Today:  monorepo -> ProjectReference
Future: service repositories -> NuGet PackageReference
```

This preserves one authoritative contract definition.

## Versioning and compatibility

The package should follow semantic-versioning expectations:

- **Patch:** documentation or internal implementation changes with no wire
  value changes.
- **Minor:** additive, backward-compatible identifiers, such as new event or
  routing-key values.
- **Major:** breaking wire changes, including renaming or removing event types,
  changing existing routing keys, or introducing incompatible payload/schema
  changes if those later become part of this package.

Existing wire values should generally be treated as immutable once deployed.
Prefer adding new event versions or identifiers over silently renaming existing
ones.

Prefer additive changes. Do not silently rename event types or routing keys,
remove fields, or add new required fields without a coordinated deployment
assessment. Preserve aggregate-version and event-ID semantics when evolving a
payload.

## Changing the contract

Before changing a contract value:

1. Identify every producer and consumer.
2. Assess backward compatibility.
3. Update contract stability tests.
4. Update .NET consumers and producers.
5. Update the TypeScript counterpart.
6. Run the full CI validation matrix.
7. Document breaking changes and required package versions.

## Future schema and code generation

As the platform grows, a language-neutral definition such as AsyncAPI, JSON
Schema, or another explicit schema format could become canonical and generate
or validate .NET and TypeScript contracts.

That toolchain is intentionally not implemented yet because the current
contract surface does not justify its additional complexity.

## Maintenance principles

## Canonical contract inventory

### Events

| Event | Producer | Routing key | Consumers | Semantic owner |
| --- | --- | --- | --- | --- |
| `BidAccepted` | Bidding | `auction.bid.accepted` | Live Feed, Operations | Bidding accepted amount and version |
| `AuctionPurchased` | Bidding | `auction.purchased` | Live Feed, Operations | Bidding Buy Now winner and fixed final price |
| `AuctionCancelled` | Bidding | `auction.cancelled` | Live Feed, Operations | Bidding cancellation |
| `AuctionClosed` | Scheduler | `auction.closed` | Live Feed, Operations | Scheduler lifecycle close |
| `WinnerSelected` | Scheduler | `auction.winner.selected` | Live Feed, Operations | Scheduler winner selection |
| `TenantStatusChanged` | Bidding | `tenant.status.changed` | Live Feed, Operations | Bidding Tenant authority |

The shared envelope is `eventId`, `eventType`, `occurredAtUtc`, `aggregateType`,
`aggregateId`, `aggregateVersion`, `correlationId`, and `payload`. `eventId` is
the at-least-once delivery idempotency key. `aggregateVersion` is producer-owned
ordering metadata. Lower versions are stale; equal-version events with distinct
event IDs are legitimate companions when the event semantics allow them; higher
versions advance the projection. A correlation ID is opaque tracing metadata,
not authorization or identity proof.

Current payload authorities are deliberately explicit: Bidding supplies the
accepted bid amount, purchase winner, fixed final price, Tenant ID, and auction
version; the Scheduler supplies ordinary close and winner-selection facts. A
consumer must not calculate a winner, cap a price, or select a Tenant from a
browser request.

### REST contracts

| Route | Owner | Consumers and boundary |
| --- | --- | --- |
| `GET /api/auctions`, `GET /api/auctions/{id}`, `GET /api/auctions/{id}/bids` | Bidding | Laravel BFF/public tenant client |
| `POST /api/auctions/{id}/bids` | Bidding | Laravel BFF; human JWT plus Tenant/ClientApplication assertion |
| `POST /api/auctions/{id}/buy-now` | Bidding | Laravel BFF; server reads BuyNowPrice |
| `GET /api/system/tenants` and status history | Bidding | SystemAdministrator Operations Portal |
| `PATCH /api/system/tenants/{tenantId}/status` | Bidding | SystemAdministrator only |
| `POST /internal/live-feed/access` | Bidding | Live Feed service identity only; not a public contract |

The Laravel routes retain session/CSRF protection and call Bidding through the
existing client abstraction. The browser supplies intent, never authoritative
price, winner, closure, or Tenant identity. Bidding owns OpenAPI/Swagger
description for its HTTP surface; this repository does not currently publish a
separate checked-in OpenAPI artifact.

### Authentication contracts

Human access uses the existing server-issued RS256 JWT and Tenant-bound
ClientApplication assertion flow. The assertion currently carries `iss`/client
identity, `kid`, `aud=dbap-bidding-service`, `tenant_id`, `jti`, `iat`, `nbf`,
and `exp`; replay protection and signature verification remain service
responsibilities. The Live Feed service uses its service identity at the
internal access boundary and is not a tenant human or SystemAdministrator.
SystemAdministrator permissions are a separate global control-plane boundary.
No secret, private key, raw token, or authorization header belongs in an event,
activity record, or shared contract.

### Transport and local projections

RabbitMQ uses the configured `auction.events` exchange, separate consumer
queues, at-least-once delivery, publisher confirms, and existing retry/DLQ
behavior. Queue names and bindings are deployment/consumer configuration, not
domain payload fields. `AuctionPurchased` is bound alongside the existing
auction events; adding a consumer must not change producer semantics.

Live Feed owns the Socket.IO public surface: `bid:accepted`, `auction:closed`,
`winner:selected`, `auction:purchased`, and `auction:cancelled`, plus the
`auction:subscribe`/`auction:unsubscribe` controls. Public rooms use
`tenant:{tenantId}:auction:{auctionId}`. Admission requires Bidding's decision
and authoritative projection ownership; browser `tenantId` is non-authoritative.
Redis keys, Lua guards, projection fields, processed-event markers, and
tenant-version markers are internal implementation details of Live Feed.

Operations Portal consumes trusted events into its own activity/history/report
models. It uses `eventId` for duplicate suppression and retains distinct
same-version event IDs when its event-history model represents them. It does
not read Bidding PostgreSQL or become a Buy Now authority. Scheduler owns
background lifecycle processing; the Outbox Publisher owns delivery, not event
meaning.

## Ownership and dependency matrix

| Contract or data | Producer/authority | Consumers | Future repository home |
| --- | --- | --- | --- |
| Auction/Tenant domain and PostgreSQL | Bidding | Bidding APIs, outbox | `dotnet-bidding-service` |
| Scheduler lifecycle command | Scheduler | Bidding persistence/events | `dotnet-bidding-service` or its worker boundary |
| Outbox rows and publication state | Bidding + Outbox Publisher | RabbitMQ | `dotnet-bidding-service` / `docker-dbap-platform` deployment |
| Integration event names/envelope | Contract project, with payload meaning owned by producers | All event consumers | versioned contract repository/package |
| Live Feed projection and Socket.IO | Live Feed | browser clients, admin diagnostics | `nodejs-live-feed` |
| Laravel BFF and React client | Laravel deployment | tenant users | `laravel-react-auction-web` |
| Operations activity/history/report | Operations Portal | SystemAdministrators | `dotnet-blazor-operations-portal` |
| Exchange/queue/Redis/runtime infrastructure | Deployment | services | `docker-dbap-platform` |

Dependency direction is producer -> contract -> consumer. Consumers may depend
on stable wire facts, but producers must not depend on consumer projections or
browser state. The future split should preserve that direction and must not
create shared database dependencies.

## Versioning and compatibility policy

Wire values, routing keys, aggregate types, ID meanings, money semantics,
Tenant semantics, and aggregate-version behavior are stable contracts. A
backward-compatible change is additive: a new event/routing key, optional field,
or consumer that tolerates an absent field. Renames, removals, changed meaning,
changed type/scale, changed ID authority, changed routing key, or new required
fields are breaking changes.

Breaking event changes require a new event version/type or a parallel route,
coordinated producer/consumer deployment, fixture updates, and a documented
deprecation window. Keep old consumers able to read the transition window;
do not rewrite historical outbox or Operations records. REST breaking changes
use a versioned route or compatibility period. SemVer guidance for a future
package is patch for non-wire documentation/tooling, minor for additive wire
surface, and major for incompatible wire changes.

Money is producer-owned fixed-precision decimal data; consumers format it and
never recompute it. IDs are opaque strings on the wire (normally UUIDs where
the producer uses UUIDs). Times are UTC ISO-8601 values produced server-side.
`occurredAtUtc` describes event occurrence; payload-specific timestamps retain
their own meaning. Correlation IDs are opaque tracing strings.

## Contract testing and future extraction

Current tests assert routing-key/event-type stability, payload parsing,
same-version convergence, idempotency, authorization, and consumer behavior.
Before extraction, add a small versioned set of JSON golden fixtures covering
each event, optional/null fields, duplicate delivery, stale/equal/higher
versions, and representative REST error responses. C# should consume a future
NuGet package; Node should consume generated TypeScript or validate against a
language-neutral JSON Schema/AsyncAPI artifact. Do not maintain hand-copied
source definitions with divergent semantics.

The repository currently uses C# `ProjectReference` dependencies for Bidding,
Scheduler, Outbox, and Operations Portal. TypeScript has a deliberately
checked counterpart in Live Feed. The first split should be documentation and
contract-fixture preparation, not a source move. A practical split order is:

1. Laravel/React deployment-bound application.
2. Live Feed projection/delivery service.
3. Operations Portal global control plane.
4. Bidding authority and scheduler/outbox boundary.
5. Infrastructure/deployment repository.

Before physical extraction, the main SHOULD-FIX items are generated or
language-neutral fixture publication, explicit deployment ownership for queue
and environment configuration, and a package compatibility pipeline. Physical
repository separation, generated client artifacts, AsyncAPI/JSON Schema
publication, and queue-topology packaging can happen after the boundaries are
accepted. No current blocker requires extraction now.

## Contract change checklist

Before merging a contract change, identify producer and every consumer; state
the authority and compatibility window; update C# and TypeScript contract
tests/fixtures; verify event ID, aggregate version, Tenant, money, and UTC
semantics; check RabbitMQ bindings and ACK/NACK/DLQ behavior; verify REST and
Socket.IO compatibility where applicable; update the event catalog and this
ownership policy; run the affected focused tests and CI gates; and record any
deprecation or package-version requirement.

## Maintenance principles

- Keep the contract surface small.
- Prefer stable, additive evolution.
- Do not turn this into a generic utility dumping ground.
- Keep deployment secrets and configuration out of the project.
- Preserve exact wire values.
- Test contract stability.
- Version the contract independently when repositories split.
