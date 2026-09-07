# Laravel Admin Architecture

Phase 13 adds a small Laravel-owned administration foundation to the existing client application. It keeps the current Blade-hosted React/Vite architecture and does not introduce Inertia, React Router, or a new frontend data layer.

## Current Client Architecture

```text
Browser
  ↓
Laravel route
  ↓
auth middleware
  ↓
admin Gate
  ↓
controller
  ↓
Eloquent
  ↓
Blade host / serialized bootstrap data
  ↓
React/Vite admin UI
```

The public auction experience remains a React/Vite SPA mounted by Laravel Blade. The browser continues to call the Bidding Service directly for auction queries and bid commands, and it continues to subscribe to the Live Feed Service through Socket.IO.

## Request Lifecycle

A request to `/admin/users` enters Laravel through `bootstrap/app.php`, which wires the web routes and standard middleware stack. The route is defined in `routes/web.php` inside the `admin` prefix and name group.

The `auth` middleware first requires an authenticated session. The `can:access-admin` middleware then checks the `access-admin` Gate. Authenticated users whose `is_admin` flag is false receive `403` and never reach the controller.

After authorization, `AdminUserController` queries the Laravel-owned `users` table with Eloquent, selects only the fields required by the page, and uses Laravel pagination at the database level. The controller maps records into an explicit payload containing only `id`, `name`, `email`, `is_admin`, and `created_at`, plus minimal pagination metadata.

Laravel renders `resources/views/admin.blade.php`, which safely serializes the bootstrap payload with `Illuminate\Support\Js::from`. The React admin entrypoint reads that bootstrap object and renders the authorized page inside the admin layout.

## Service Container / Service Providers

The `access-admin` Gate is registered during Laravel application bootstrapping in `App\Providers\AppServiceProvider`. This uses Laravel's provider mechanism for framework-level authorization configuration.

Phase 13 does not add artificial service container bindings. The dashboard and user listing are simple Laravel-owned read concerns, so thin controllers and direct Eloquent queries are enough for now.

## Facades vs Dependency Injection

The implementation uses Laravel framework facilities where they are appropriate: routes, middleware, Gate registration, configuration helpers, Blade rendering, and Eloquent. These are infrastructure concerns already represented by Laravel's conventions.

Explicit dependency injection should be introduced later when an application service has meaningful dependencies or business behavior to coordinate. Phase 13 intentionally avoids fake service classes whose only purpose would be demonstrating DI.

## Database Ownership

Laravel owns user records, the `is_admin` designation, session/cache/job metadata, and later web/admin concerns such as CMS content or user preferences.

The Bidding Service remains authoritative for auction and bid domain state, including bid acceptance, bid ordering, aggregate version ownership, concurrency control, current bid values, winner selection, and auction state transitions.

The Live Feed Service remains responsible for real-time presentation updates according to the current RabbitMQ, Redis, and Socket.IO architecture.

## Frontend Architecture

Inertia was intentionally not introduced because the current application already uses Laravel routes, Blade hosts, and React/Vite entrypoints. Adding another server-to-client rendering convention during this foundation phase would increase complexity without solving a current problem.

React Router was also intentionally not introduced. Laravel routes continue to own HTTP route authorization and page selection. React renders inside an already authorized page using explicit bootstrap data from Laravel.

The admin UI uses reusable React components for layout, navigation, header, dashboard metrics, users table, and pagination while keeping state minimal and local.

## N+1 Notes

The Phase 13 user listing does not display relationships, so there is no relationship access inside loops and no artificial eager-loading example. Richer N+1 prevention examples should appear naturally in later CMS phases if pages, authors, revisions, or audit entries are displayed together.

## Phase 15 services

CMS caching, events, listeners, and audit logging are documented in [services-events-cache.md](services-events-cache.md). The admin Gate remains registered through Laravel bootstrapping, while CMS-specific service bindings now live in App\Providers\CmsServiceProvider.


## Phase 16 queues

Queued exports, scheduled CMS publication, notification preferences, and queued publication notifications are documented in [queues-jobs-scheduling.md](queues-jobs-scheduling.md).


## Phase 17 React/Vite Review

React lifecycle, Strict Mode, routing, data-fetching boundaries, and Vite multi-entry build behavior are documented in [react-vite-architecture.md](react-vite-architecture.md).


## Local Session Login

Manual admin access uses Laravel's session guard. `GET /login` renders a small Blade form, `POST /login` authenticates with `Auth::attempt`, regenerates the session, and redirects intended users to `/admin`. `POST /logout` logs out, invalidates the session, and regenerates the CSRF token.

This does not weaken admin authorization. Admin routes still require both `auth` and `can:access-admin`, so a successfully authenticated non-admin receives `403` at `/admin`.
## Internal Admin Navigation

The admin area keeps real Laravel routes as the source of truth. A direct request or browser refresh for `/admin`, `/admin/users`, `/admin/pages`, `/admin/faqs`, `/admin/audit-logs`, or `/admin/exports` still flows through the `auth` middleware, the `can:access-admin` Gate, the controller, Blade, and then the React admin shell.

For ordinary same-origin clicks inside the already-authorized admin shell, React intercepts admin anchors, calls the same Laravel route with `Accept: application/json`, and swaps the returned bootstrap payload into the mounted admin content area:

```text
Admin click
  ↓
prevent default for same-origin admin links
  ↓
history.pushState()
  ↓
authorized JSON request to the same Laravel route
  ↓
React content update without document reload
```

The sidebar and header remain mounted, so navigation avoids the visible Blade/Vite document reload flicker from earlier phases. Browser Back/Forward is handled with `popstate`, and the listener is cleaned up when the admin root unmounts. Modified clicks, external links, export downloads, and form submissions retain normal browser behavior.

Client-side navigation is only a usability optimization after authorization has already succeeded. It does not bypass Laravel authentication or the `access-admin` Gate because JSON payloads are served by the same protected routes.

## Development Seed Data

`php artisan db:seed` creates deterministic local/demo content through `DemoAdminSeeder`, `PageSeeder`, and `FaqSeeder`. It creates or updates a demo admin user, publishes default pages for `about`, `how-it-works`, `terms`, and `privacy`, and publishes six concise FAQs that describe the auction client without changing bidding responsibilities.

The seeders use idempotent lookups so repeated runs update existing demo rows instead of creating duplicates. They assign creator/updater relationships to the seeded administrator and invalidate relevant public CMS cache entries after updating seeded CMS content.
