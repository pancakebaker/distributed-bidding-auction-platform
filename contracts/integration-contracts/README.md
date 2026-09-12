# Distributed Bidding Integration Contracts

## Purpose

This project defines stable wire-level identifiers used across the distributed
bidding platform's service boundaries. It prevents producers and consumers from
independently duplicating correctness-sensitive protocol strings. It is the
contract boundary shared by the Bidding Service, outbox publisher, scheduler
where applicable, live-feed service, Operations Portal, and future external
clients/services.

This is a deliberately small contract project, not a general-purpose shared
utilities library.

## Current contracts

The following values are part of the integration protocol and should not be
casually renamed:

### Event types

- `BidAccepted`
- `AuctionClosed`
- `WinnerSelected`
- `AuctionPurchased`

### Aggregate type

- `Auction`

### RabbitMQ routing keys

- `auction.bid.accepted`
- `auction.closed`
- `auction.winner.selected`
- `auction.purchased`

The RabbitMQ exchange name, `auction.events`, is deliberately not owned here.
It remains deployment and service configuration because environments may
override it.

## Ownership

The contract is not owned by the bidding service, scheduler, outbox publisher,
or Operations Portal individually. It represents the protocol boundary between
producers and consumers:

- the bidding service produces `BidAccepted`;
- the scheduler produces `AuctionClosed` and `WinnerSelected`;
- the outbox publisher transports those events;
- the Operations Portal and live-feed service consume them.

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

- Keep the contract surface small.
- Prefer stable, additive evolution.
- Do not turn this into a generic utility dumping ground.
- Keep deployment secrets and configuration out of the project.
- Preserve exact wire values.
- Test contract stability.
- Version the contract independently when repositories split.
