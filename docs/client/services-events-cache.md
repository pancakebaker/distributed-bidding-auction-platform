# Services, Events, Cache, and Audit Trail

Phase 15 adds Laravel-owned service boundaries around the CMS/admin features. It does not move auction or bidding authority into Laravel.

## Service Container

The CMS cache is the deliberate dependency-inversion example:

```text
App\Contracts\CmsCache
  ↓ bound in
App\Providers\CmsServiceProvider
  ↓ implemented by
App\Services\LaravelCmsCache
  ↓ injected into
public CMS controllers and cache-invalidation listeners
```

`CmsCache` is small because the real boundary is small: public CMS reads need caching and cache invalidation needs a stable API. Controllers depend on the interface instead of a concrete cache implementation, which keeps the public CMS layer testable without reaching for Laravel's service locator.

## Service Providers

`CmsServiceProvider` owns CMS-specific bootstrapping:

- binding `CmsCache` to `LaravelCmsCache`
- binding `AuditLogExporter` to `CsvAuditLogExporter`

Laravel's event discovery wires the CMS listeners, so the provider does not duplicate listener registration manually.

`AppServiceProvider` still owns the broader admin Gate. Keeping the CMS binding in its own provider prevents `AppServiceProvider` from becoming a bucket for unrelated application features.

## Facades vs DI

The code intentionally uses both patterns where they fit:

- Constructor injection is used for `CmsCache`, because that is an application boundary with a real alternative in tests.
- Laravel facades/helpers remain appropriate for framework infrastructure such as `DB::table`, `route()`, `config()`, `Cache`, `Storage`, queue dispatching, and test assertions.

The goal is not to remove facades everywhere. It is to use explicit dependencies where application behavior benefits from substitution and clearer ownership.

## Events and Listeners

CMS writes now follow this flow:

```text
Admin controller
  ↓
Eloquent save succeeds
  ↓
CMS event
  ├── RecordAuditLog
  └── InvalidateCmsCache
```

Events are dispatched after successful persistence, so failed validation or failed saves do not create audit entries or invalidate cache. The listeners are synchronous for now because audit logging is part of the admin write outcome and should be deterministic during this phase. Queued listeners can be introduced later for non-critical background work.

## Caching

Public CMS reads are cached through Laravel's cache abstraction, so the current `database` cache store works locally and Redis can be introduced later without changing controller code.

Cache keys:

- pages: `cms:page:{slug}`
- FAQs: `cms:faqs`

Public page and FAQ payloads use a 30-minute TTL. Admin list/edit responses are not cached because admins should see fresh database state.

Missing, draft, and future-published pages are not negative-cached. Public page controllers also check the route-bound `Page` publication rule before reading from cache, so a stale cache key cannot make a draft or future page visible. Once future-published content becomes eligible, it can be resolved without waiting for an old negative cache entry to expire.

## Cache Invalidation

`InvalidateCmsCache` responds to CMS events:

- `PageCreated`: forgets the new page slug key
- `PageUpdated`: forgets both the old slug and current slug keys
- `FaqCreated` and `FaqUpdated`: forget `cms:faqs`

Invalidating both old and new page slug keys matters because an admin may change a slug while a previous public payload exists.

## Audit Architecture

`audit_logs` is an append-only Laravel-owned table. It records:

- `user_id` for the authenticated admin, nullable for system-originated events
- `action`
- `auditable_type`
- `auditable_id`
- small JSON `metadata`
- `created_at`

Audit metadata is intentionally minimal. Page logs store title, slug, and status, but not body content. FAQ logs store question, sort order, and publication state, but not answer content. Passwords, tokens, cookies, request bodies, API credentials, and secrets are not logged.

The admin audit page renders a curated payload, not raw metadata JSON.

## Query Builder vs Eloquent

CMS CRUD remains Eloquent because pages and FAQs are model-centric operations with relationships and casts.

The dashboard uses Query Builder for aggregate reporting:

- page counts by status
- audit counts by action

Those queries do not need model hydration, so Query Builder keeps the reporting intent direct.

## React

`useAdminPagination` centralizes repeated pagination labels and link state shared by Users and Audit Log. It is larger than a one-line state wrapper and removes duplicated UI derivation from table pages.

Memoization was not added broadly. The audit labels and summaries are prepared server-side, and the client renders small bootstrap payloads. Adding `useMemo`, `useCallback`, or `memo` here would add cognitive overhead without a meaningful performance win.

## Bidding Boundary

Laravel audit/cache/events in this phase apply only to CMS and admin behavior. Laravel still does not validate bids, order bids, own current bid state, manage aggregate versions, perform auction settlement, or control Redis/RabbitMQ bidding state. The Bidding Service and Live Feed Service remain authoritative according to the existing architecture.

## Phase 16 queues

Queued exports, scheduled CMS publication, notification preferences, and queued publication notifications are documented in [queues-jobs-scheduling.md](queues-jobs-scheduling.md).


## Phase 17 React/Vite Review

React lifecycle, Strict Mode, routing, data-fetching boundaries, and Vite multi-entry build behavior are documented in [react-vite-architecture.md](react-vite-architecture.md).

