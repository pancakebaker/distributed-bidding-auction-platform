# Laravel CMS Architecture

Phase 14 adds a small CMS owned by the Laravel client application. It does not move auction or bidding authority into Laravel.

## Eloquent Relationships

The CMS introduces two Laravel-owned models:

- `App\Models\Page`
- `App\Models\Faq`

Both models track `created_by` and `updated_by` user IDs. `Page` and `Faq` each define `creator()` and `updater()` `belongsTo` relationships. `User` defines `createdPages()`, `updatedPages()`, `createdFaqs()`, and `updatedFaqs()` `hasMany` relationships with explicit foreign keys.

These relationships exist because admin listings display creator and updater names, and because create/update actions derive attribution from the authenticated administrator.

## N+1 Query Avoidance

Admin page and FAQ listings display related user names. Loading those records lazily would create a real N+1 problem:

```text
Bad:
1 query for pages
N queries for creators or updaters while rendering each row
```

The controllers instead eager load the displayed relationships:

```php
Page::query()->with(['creator:id,name', 'updater:id,name'])->get();
Faq::query()->with(['creator:id,name', 'updater:id,name'])->get();
```

That keeps relationship data available before the list payload is mapped for React.

## Query Builder vs Eloquent

CMS CRUD uses Eloquent because pages and FAQs are model-centric records with casts, relationships, factories, and scopes.

The dashboard uses one small Query Builder aggregate to count pages grouped by status. That query does not need hydrated `Page` models and is naturally aggregate-oriented, so Query Builder is a good fit there. FAQ published counts use the `Faq::published()` scope because the model scope expresses the public visibility rule clearly.

## Form Requests

Create and update validation lives in dedicated Form Requests:

- `StorePageRequest`
- `UpdatePageRequest`
- `StoreFaqRequest`
- `UpdateFaqRequest`

Each request authorizes through the existing `access-admin` Gate and owns its validation rules. Controllers stay focused on mapping validated input, deriving creator/updater IDs from the authenticated admin, and redirecting with flash feedback.

Page update validation ignores the current page when checking slug uniqueness. Controllers do not duplicate validation rules.

## Route Model Binding

Admin edit/update routes use Laravel route model binding for `Page` and `Faq` records. Public page rendering uses `/pages/{page:slug}`, avoiding catch-all routing and protecting existing `/admin` and `/auctions` routes.

`Page` uses slug route keys so generated page URLs are readable and stable for CMS content.

## Database Version Control

Migrations are the source of truth for CMS schema:

- `pages` stores slug, title, plain-text body, status, optional publish timestamp, creator/updater IDs, and timestamps.
- `faqs` stores question, plain-text answer, sort order, publication flag, creator/updater IDs, and timestamps.

The migrations are compatible with SQLite and MySQL. They use normal Laravel schema builder APIs, foreign keys to `users`, useful indexes, and no database-specific SQL.

Factories support tests and future local development without requiring manual SQLite edits.

## Published State

A page is publicly visible only when:

```text
status = published
AND (published_at is null OR published_at <= now())
```

This rule is centralized in `Page::published()` and `Page::isPubliclyVisible()`. Future-dated published pages can be prepared in advance but do not render publicly until their timestamp is current or past. No scheduled publishing worker is introduced in this phase.

A FAQ is publicly visible when `is_published = true`, ordered by `sort_order` and then `id`.

## Security

CSRF protection remains Laravel's standard web behavior. Admin forms submit normal POST requests with the Laravel CSRF token and use method spoofing for updates.

CMS content is treated as plain text. React renders page bodies and FAQ answers as text nodes and does not use `dangerouslySetInnerHTML`, so stored HTML is escaped instead of executed.

Mass assignment is constrained. Page and FAQ fillable fields exclude `created_by` and `updated_by`; controllers derive those values from the authenticated administrator and ignore browser-submitted attribution IDs.

All admin CMS routes use `auth` plus `can:access-admin`. Normal users cannot reach the controllers, and public routes only expose published content.

SQL injection risk is avoided by using Eloquent, Laravel validation rules, query builder bindings, and route model binding rather than concatenating raw SQL.

## React State Design

The admin CMS forms use local component state for field values because those values directly affect rendering. Parent form components own the form state and pass values plus change handlers into reusable field components. That demonstrates lifted state and props without introducing global state.

Context is intentionally not used. It would be justified later if multiple distant admin components needed shared cross-page state, such as a notification center or persistent editor preferences. For Phase 14, form state is local to one page.

Refs are not used as a replacement for state. They would be appropriate for non-rendering concerns such as input focus or measuring a DOM element, but the current forms only need render-affecting values and submit state.

## Phase 15 services

Public CMS caching, cache invalidation, CMS write events, and audit logging are documented in [services-events-cache.md](services-events-cache.md). The CMS domain remains Eloquent-first; aggregate dashboard reporting uses Query Builder where model hydration is unnecessary.


## Phase 16 queues

Queued exports, scheduled CMS publication, notification preferences, and queued publication notifications are documented in [queues-jobs-scheduling.md](queues-jobs-scheduling.md).


## Phase 17 React/Vite Review

React lifecycle, Strict Mode, routing, data-fetching boundaries, and Vite multi-entry build behavior are documented in [react-vite-architecture.md](react-vite-architecture.md).

