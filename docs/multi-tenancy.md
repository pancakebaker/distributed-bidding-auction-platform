# Multi-tenancy architecture

This document is the final MT6.6 tenancy boundary reference. It records ownership
and isolation rules before Buy Now expansion and any future repository split.

## Identity and authority

| Concern | Owner | Scope | Rule |
| --- | --- | --- | --- |
| Tenant identity, status, and `Tenant.Version` | Bidding PostgreSQL | Explicit `TenantId` | The persisted `Tenant` row is authoritative. |
| Auction | Bidding Service | One immutable `Auction.TenantId` | Auction ownership is assigned from trusted tenant context and is not client-selected. |
| Bid | Bidding Service | Through its Auction | A bid derives tenant ownership from the referenced Auction. |
| ClientApplication and credentials | Bidding Service | One Tenant | Application assertions must match both the registered application tenant and the bearer tenant. |
| Tenant lifecycle history | Bidding PostgreSQL | One Tenant per row | Append-only administrative evidence, committed with the status transition and outbox row. |
| Laravel CMS | Laravel installation | Deployment-bound Tenant | Each installation is configured for one server-side `TENANT_ID`. |
| Live Feed projection and rooms | Live Feed | Tenant/Auction | Redis is projection and ordering state, never TenantStatus authority. |
| Operations Portal | Operations Portal/Bidding API | Global | SystemAdministrator is a separate global control-plane identity. |

Human identity is the JWT `sub`; tenant identity is the trusted `tenant_id`;
client identity is `client_id`/issuer; service identities have dedicated
subjects and audiences; SystemAdministrator is a separate platform identity.
These identities are never interchangeable.

## Request isolation

Tenant-facing Bidding requests derive tenant context from validated server-issued
claims and apply explicit `Auction.TenantId` predicates. A foreign or missing
resource is returned as `404` to avoid resource disclosure. Authentication
failures are `401`; authenticated permission or status denials are `403`; an
authoritative status dependency failure is `503`.

The persisted status is evaluated before the tenant-facing handler. `Active`
allows normal reads and mutations, `Suspended` allows reads but denies mutations,
and `Disabled` denies tenant-facing access. A foreign resource is not disclosed
through a status response. SystemAdministrator routes under `/api/system/...`
are intentionally global and do not use tenant-user status filters.

## Laravel deployment boundary

The intended deployment is one Laravel/React installation per customer:

```text
customer-a.example -> Laravel installation A -> Tenant A credentials/context
customer-b.example -> Laravel installation B -> Tenant B credentials/context
```

The installation tenant is server configuration, not query/form/browser state.
Laravel-issued Bidding tokens carry the configured tenant and the authenticated
human subject. The BFF refuses to issue a token when the user tenant differs from
the installation tenant. There is no runtime tenant-switching feature in this
repository. CMS pages, FAQs, navigation, scheduled publishing, and Laravel cache
are installation-local; shared infrastructure must use distinct application/cache
namespaces per installation.

## Live Feed isolation

Public admission is:

```text
auction:subscribe
 -> validate AuctionId
 -> Bidding POST /internal/live-feed/access
 -> resolve projection-owned TenantId
 -> socket.join(tenant:{tenantId}:auction:{auctionId})
```

The optional browser `tenantId` is compatibility metadata only. It is never an
authorization source or public-room selector. If Bidding allows an auction while
the Live Feed projection has not yet materialized its tenant ownership, the join
fails closed. Unsubscribe may use the supplied legacy room metadata only to leave
a room; it does not grant access.

Auction events carry authoritative `tenantId` and use tenant-aware Redis keys.
The tenant status version marker is an atomic ordering guard only. `Disabled`
events evict that tenant's public rooms; `Active` and `Suspended` do not evict,
and reactivation never auto-rejoins a socket. Existing subscriptions are
eventually revoked through the outbox/RabbitMQ path; new subscriptions are always
protected synchronously by Bidding.

## Background and control-plane behavior

Scheduler and outbox workers are global infrastructure. They process all tenants
without a tenant-user JWT and must continue domain lifecycle processing for
Suspended and Disabled tenants. Tenant status controls tenant-facing access, not
authoritative auction closure or event publication.

Operations Portal users are global SystemAdministrators. They may list tenants,
inspect selected history, and change selected status through Bidding APIs. The
portal never accesses Bidding PostgreSQL directly, impersonates a tenant user, or
derives current state from history. Tenant history is bounded cursor pagination,
tenant-filtered in SQL, append-only, and separate from outbox delivery state.

## Failure and future split rules

RabbitMQ outage may delay Live Feed revocation, but committed Bidding state,
history, and outbox rows remain durable. Redis outage fails Live Feed event
ordering/revocation closed through the existing retry path. No JWT, browser state,
Redis status cache, event routing key, or portal projection can override Bidding's
Tenant row.

The intended future repository boundary is:

- `dotnet-bidding-service`: Tenant, Auction, status, history, and outbox authority;
- `laravel-react-auction-web`: one deployment-bound Tenant client/BFF;
- `nodejs-live-feed`: tenant-aware projection and delivery, without database authority;
- `dotnet-blazor-operations-portal`: global SystemAdministrator control plane;
- infrastructure repository: Docker, broker, database, and runtime composition.

Integration contracts remain a small producer/consumer wire boundary. They are
not a shared domain model and must not create circular source dependencies.

Buy Now is a tenant-scoped Bidding command and must preserve the same identity,
resource, status, and concurrency boundaries when its next phase is undertaken.
