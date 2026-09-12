# React and Vite Architecture

Phase 17 reviews the current Blade-hosted React/Vite client and adds only targeted frontend improvements. It does not add business features, client-side routing, frontend cache libraries, or auction-domain ownership.

## React Architecture

The application has three React roots:

- `resources/js/app.tsx` (thin public entrypoint)
- `resources/js/app/AuctionApp.tsx` owns the public path switch, with feature pages under `resources/js/app/pages/`, shared public components under `resources/js/app/components/`, and public hooks/helpers under `resources/js/app/hooks/` and `resources/js/app/utils/`.
- `resources/js/admin/AdminApp.tsx` mounts Laravel-owned admin pages into `#admin-app`.
- `resources/js/cms/PublicCmsApp.tsx` mounts public CMS pages and FAQs into `#cms-app`.

All three roots are wrapped in `React.StrictMode`. In development, Strict Mode can intentionally mount, unmount, and re-run effects to surface unsafe lifecycle logic. The existing timer and Socket.IO effects clean up after themselves, so this is safe and useful for the current app.

A representative admin tree is:

```text
AdminApp
  ↓
AdminLayout
  ├── AdminSidebar
  ├── AdminHeader
  └── UsersPage / PagesPage / FaqsPage / AuditLogPage / ExportsPage
```

When a form or button calls `setState`, React schedules work against its Fiber tree. Render computes the next element tree, reconciliation compares it with the previous render, and the commit phase applies the necessary host DOM updates. Fiber is React's internal scheduling and reconciliation architecture; application code does not call Fiber directly.

The virtual DOM is the React element representation used during render and reconciliation. For example, when an admin form changes from `Save` to `Saving...`, React renders a new representation of that button. Reconciliation determines what changed, and the commit phase updates the real DOM. React avoids many unnecessary DOM writes, but it is not accurate to claim it always performs the absolute theoretical minimum mutation.

## Functional Lifecycle

The clearest lifecycle example is the auction detail live feed:

```text
AuctionDetailPage mounts
  ↓
connectAuctionFeed opens a Socket.IO connection
  ↓
connect handler subscribes to the auction room
  ↓
auctionId changes or component unmounts
  ↓
effect cleanup disconnects the socket
```

The cleanup is tested so Strict Mode and route changes do not leave duplicate live-feed subscriptions behind. The `useNow` timer also clears its interval on unmount, and `usePath` removes its `popstate` listener.

## State, Props, and Context

State is local where it directly affects rendering: auction lists, bid form values, live connection status, admin form values, export submit state, and notification preference checkboxes.

State is lifted only when child controls need to share and update one parent-owned form value. For example, `PageForm` owns title, slug, body, status, and published-at state, then passes values and change handlers to `AdminField` and `AdminTextarea`.

Prop passing is currently shallow and readable. Server-derived page data enters at `AdminApp` or `PublicCmsApp`, then flows one or two levels into page components. Context is not introduced because there is no deeply shared cross-tree concern yet. Context would become appropriate for a persistent admin notification center, global authenticated-session display state, or shared editor preferences used across unrelated branches. It would add rerender coupling and API surface without solving a current problem.

Refs are not used in the current frontend code. That is intentional. Rendered values belong in state. Refs would be appropriate for non-rendering concerns such as focusing an input after a validation error, measuring a DOM element, or holding an interval handle for polling. They should not be used to bypass state for visible UI data.

## Custom Hooks and Memoization

The app has small custom hooks with real ownership:

- `useNow` owns the ticking clock lifecycle for auction countdowns.
- `usePath` owns the lightweight public auction demo path state.
- `useAdminPagination` derives shared pagination labels and navigation URLs for admin tables.

A separate live-feed hook was not extracted because the subscription currently has one clear owner: `AuctionDetailPage`. Moving it into `useAuctionLiveFeed` would be reasonable if more auction views began subscribing or if the lifecycle logic became shared.

Memoization is deliberately limited. Phase 17 removed a `useMemo` around a cheap live-status string because dependency comparison, retained closures/values, and extra cognitive overhead are not free. The current admin and CMS pages render small server-prepared payloads, so broad `useMemo`, `useCallback`, or `React.memo` would make the code harder to reason about without measurable benefit.

Concurrent features such as `useDeferredValue` and `startTransition` are also deferred. Server-side pagination keeps lists small, and there is no expensive local filtering while typing. A future client-side audit-log filter over a large local dataset would be a better candidate for `useDeferredValue`.

## Data Architecture

The client intentionally uses three data paths because they represent different authorities:

```text
Laravel route/controller
  ↓
Blade
  ↓
serialized bootstrap data
  ↓
React
```

This path is used for admin pages, public CMS pages, notification preferences, and other server-authorized Laravel concerns. `Illuminate\Support\Js::from` serializes bootstrap payloads safely.

```text
React browser
  ↓
resources/js/api.ts
  ↓
Bidding Service
```

This path is used for auction discovery, auction detail, bid history, ordinary bid commands, and the explicit Buy Now command. The Bidding Service remains authoritative for sale mode, BuyNowPrice, bid validation, ordering, aggregate versions, concurrency, and auction state. SaleMode controls which actions render: AuctionOnly shows bidding, BuyNowOnly shows only Buy Now, and AuctionAndBuyNow shows both distinct actions. BuyNowPrice is authoritative for purchase display; the browser never sends a purchase price.

```text
React browser
  ↓
resources/js/liveFeed.ts
  ↓
Live Feed Service
```

This path is used for real-time auction updates through Socket.IO, including `auction:purchased`, `auction:closed`, `auction:winner-selected`, and `auction:bid-accepted`. The React component treats live events as presentation updates and still reconciles state with the authoritative Bidding API when needed. A purchase updates FinalWinnerId/FinalPrice and never rewrites CurrentBidAmount/CurrentBidderId. Lower aggregate versions are ignored, while distinct same-version `auction:purchased` and `auction:closed` events are merged in either order.

React Query or SWR was not introduced. Laravel already caches public CMS reads server-side, auction state comes from the Bidding Service and Live Feed Service, and admin pages receive server-prepared bootstrap payloads. A client cache layer would duplicate invalidation responsibilities at this scale.

## Routing

Laravel owns HTTP routing and authorization:

```text
Browser request
  ↓
Laravel route
  ↓
auth / Gate middleware when needed
  ↓
Blade host
  ↓
React renders inside the resolved page
```

React Router is intentionally not used for admin or CMS pages because Laravel already resolves the route and enforces authorization before React runs. The public auction demo has a tiny `history.pushState` path helper for `/auctions` and `/auctions/{id}` only; it does not replace Laravel routing for protected pages.

## Vite Architecture

The installed frontend versions are:

- Vite `8.2.2`
- React plugin `@vitejs/plugin-react` `6.1.1`
- Laravel Vite plugin `3.2.0`
- Tailwind Vite plugin `4.3.3`
- React `19.2.8`

`vite.config.js` uses the Laravel plugin with four inputs:

- `resources/css/app.css`
- `resources/js/app.tsx` (thin public entrypoint)
- `resources/js/admin/AdminApp.tsx`
- `resources/js/cms/PublicCmsApp.tsx`

The config also enables React support, Tailwind processing, Laravel refresh integration, jsdom tests, `resources/js/test/setup.ts`, and a watch ignore for compiled Blade views under `storage/framework/views`.

During development, Vite serves source modules over browser-native ESM and transforms modules on demand instead of bundling the entire app before startup. Dependency optimization and transforms are handled by Vite's current toolchain. In this installed Vite 8 package, the package metadata includes `rolldown`, `esbuild`, and related transform tooling, so the accurate summary is modern Vite pipeline plus plugins rather than the older simplified phrase "esbuild in dev, Rollup in build".

For production builds, Vite emits a manifest and hashed assets for the configured entrypoints. The current build output includes separate public auction, admin, and CMS entry files, a shared React JSX runtime chunk, CSS, and font assets. The bundles are small enough that manual chunking and `React.lazy` would add complexity before there is a bundle-size problem.

## HMR and Fast Refresh

In development, editing a file such as `resources/js/admin/AdminApp.tsx` follows this flow:

```text
file changes
  ↓
Vite detects the module update
  ↓
HMR update is sent to the browser
  ↓
React Fast Refresh evaluates the component boundary
  ↓
compatible component state may be preserved
```

A full reload can still occur when a module is not a safe refresh boundary, when non-component module shape changes invalidate dependents, or when Blade/PHP changes require Laravel page refresh behavior.

## Environment Variables

Frontend code reads only:

- `import.meta.env.VITE_BIDDING_API_URL`
- `import.meta.env.VITE_LIVE_FEED_URL`

The `VITE_` prefix is important: Vite exposes those values to browser code. They must contain public browser-reachable URLs, not passwords, API tokens, RabbitMQ credentials, Redis credentials, database credentials, or `APP_KEY`.

## Accessibility and Tests

The existing ESLint configuration keeps React Hooks and JSX accessibility rules active for `apps/client/resources/js/**/*.{ts,tsx}`. Production frontend modules must begin with a JSDoc responsibility block, and exported APIs need JSDoc summaries.

Phase 17 adds a focused cleanup test for the live-feed Socket.IO subscription. It does not test React internals, HMR internals, or Fiber nodes.

## Bidding Boundary

The client keeps Laravel as the Blade/web boundary and does not own authoritative auction behavior. Buy Now is an explicit action and is never inferred from a bid amount; ordinary bids remain strictly below BuyNowPrice. CurrentBid* represents ordinary bidding, while Final* represents terminal outcome. Conflict responses refresh authoritative state without automatically replaying a purchase command.
