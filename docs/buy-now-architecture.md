# Buy Now architecture and closure reference

This document is the final BN5 cross-layer reference for Buy Now. It records
the ownership boundaries, event contract, terminal-state rules, and failure
semantics that are already implemented in the monorepo. It does not introduce
payment processing, an order system, or a second Buy Now domain model.

## Sale-mode truth table

| Sale mode | Ordinary bid | Explicit Buy Now | Buy Now price | Terminal event set |
| --- | --- | --- | --- | --- |
| `AuctionOnly` | Yes | No | None | `BidAccepted`, then ordinary close events when applicable |
| `BuyNowOnly` | No | Yes | Required fixed price | `AuctionPurchased`, `AuctionClosed` |
| `AuctionAndBuyNow` | Yes, below threshold | Yes | Required fixed price | Normal: `BidAccepted`; threshold: `BidAccepted`, `AuctionPurchased`, `AuctionClosed` |

For `AuctionAndBuyNow`, a submitted amount greater than or equal to
`BuyNowPrice` is accepted at exactly `BuyNowPrice`. The Bidding Service, not a
consumer or browser, chooses the winner, final amount, terminal status, and
aggregate version. Buy Now terminal transitions do not emit `WinnerSelected`.

`BuyNowOnly` uses the existing persisted starting-price field as a compatible
schema representation, normalized to the fixed Buy Now price. That is a
storage compatibility detail; it does not make competitive bidding available.

## Authority and ownership

| Concern | Authoritative owner | Other layers do |
| --- | --- | --- |
| Sale mode and `BuyNowPrice` | Bidding Service/PostgreSQL | Read and display |
| Bid acceptance and concurrency | Bidding Service/PostgreSQL | Submit commands |
| Winner, final amount, and closure | Bidding Service/PostgreSQL | Project trusted responses and events |
| `TenantId` resource ownership | Bidding Service/Auction | Validate and preserve |
| Aggregate version | Bidding Service/Auction | Reject stale state and merge valid companions |
| Durable event intent | Bidding transactional outbox | Publish/consume |
| Public terminal projection | Live Feed/Redis | Deliver to the owning public room |
| Bidder-facing commands | Laravel BFF to Bidding | React supplies intent only |
| Operational visibility | Operations Portal activity projection | Display to SystemAdministrators |

The browser never supplies authoritative price, winner, closure, aggregate
version, or Tenant ownership. Operations Portal is a global observer, not a
tenant-facing command path. Live Feed is a delivery projection, not a second
auction authority.

## Event contract and delivery

The Bidding Service commits auction state and outbox rows in one PostgreSQL
transaction. The outbox publisher emits on `auction.events` using these stable
routing keys:

| Event | Routing key | Meaning |
| --- | --- | --- |
| `BidAccepted` | `auction.bid.accepted` | A normal or threshold bid was accepted |
| `AuctionPurchased` | `auction.purchased` | Buy Now completion with fixed price and purchaser |
| `AuctionClosed` | `auction.closed` | The auction entered its terminal closed state |
| `WinnerSelected` | `auction.winner.selected` | Ordinary winner selection; not required by Buy Now |

Threshold Buy Now emits `BidAccepted`, `AuctionPurchased`, and `AuctionClosed`
with distinct `eventId` values and the same resulting `aggregateVersion`.
Explicit Buy Now emits `AuctionPurchased` and `AuctionClosed` with the same
version. `AuctionPurchased` carries the authoritative auction, Tenant,
purchaser, fixed final price, purchase time, and auction version through the
validated integration envelope.

At-least-once delivery is expected. Consumers use `eventId` for duplicate
suppression and `aggregateVersion` for ordering; one is not a replacement for
the other. Lower versions are ignored. A higher version advances the
projection. A new, legitimate event at the current version may merge as a
companion, but merging is non-regressing:

- a closed projection cannot reopen;
- a Buy Now outcome cannot become an ordinary close;
- an established purchaser or fixed final price cannot be cleared or replaced
  by an incomplete companion;
- Tenant ownership cannot be replaced by browser or consumer-derived data.

Live Feed applies these rules atomically in Redis, then broadcasts the
persisted projection. Redis failure follows the existing retry/NACK path; an
event is not ACKed after losing its projection update. Operations Portal uses
the trusted event ID as its durable activity idempotency key, so distinct
same-version activity events remain distinct while duplicate publication does
not create duplicate records.

## Cross-layer flow

```text
React intent
  -> Laravel session/CSRF-protected BFF
  -> Bidding authorization and PostgreSQL transaction
  -> transactional outbox
  -> confirmed RabbitMQ publication
  -> Live Feed projection -> public Socket.IO room
  -> Operations Portal activity projection -> admin activity/history/report
```

The BFF sends an empty Buy Now command; it does not accept a client price or
client Tenant authority. React may explain threshold behavior and format
prices, but it adopts the server response and trusted live projection. The
Operations Portal displays `AuctionPurchased` as “Buy Now purchase” and uses
the producer-supplied Tenant, purchaser, final amount, time, and version. It
does not infer a purchase from a bid amount or read the Bidding database.

RabbitMQ outage does not roll back a committed auction: Bidding state and the
outbox remain durable and the publisher retries. Consequently, public Live
Feed revocation/delivery can be delayed, while REST and operational state
remain authoritative according to their own boundaries. A rejected, stale,
unauthorized, expired, or failed command creates no partial winner, close,
version, or outbox state.

## Security and tenant boundaries

- Bidding derives Tenant ownership from the authenticated/resource context and
  validates cross-Tenant access before mutation.
- Laravel is deployment-bound to its configured Tenant and keeps downstream
  human credentials server-side; browsers do not choose Tenant identity.
- Live Feed requires both Bidding admission and authoritative projection
  ownership before joining `tenant:{tenantId}:auction:{auctionId}`. Missing
  projection ownership fails closed.
- Operations Portal uses its separate global `SystemAdministrator` boundary;
  it may observe cross-Tenant operational activity without impersonating a
  tenant user.
- Redis stores projection/idempotency and tenant status-version metadata, not
  authoritative Tenant status, price, winner, or closure.
- No layer in BN1–BN4 captures payment, creates orders/invoices, or performs
  settlement.

## Failure and concurrency checklist

The final supported behavior is:

1. Competing terminal commands produce one committed winner and one logical
   terminal transition; the loser revalidates and receives a controlled
   conflict/closed result without retrying automatically.
2. Threshold overbids are normalized by Bidding before any event or consumer
   sees them; every layer displays the fixed `BuyNowPrice`, never the submitted
   amount.
3. Same-version threshold and explicit event permutations converge to the
   same closed projection, winner, final price, and Tenant ownership.
4. Ordinary `AuctionOnly` bids remain ordinary bids and do not acquire Buy Now
   semantics merely because of an amount.
5. Scheduler closure remains compatible with already-terminal Buy Now state
   and cannot select a second winner or emit a second terminal transition.
6. Duplicate events are safe, stale lower versions cannot regress state, and
   transient persistence failures are retried rather than acknowledged and
   lost.

## Future repository boundaries

The current monorepo is the implementation boundary. The intended future
ownership is:

| Future repository | Responsibility |
| --- | --- |
| `dotnet-bidding-service` | Auction/Tenant authority, commands, PostgreSQL, outbox |
| `nodejs-live-feed` | Event consumption, Redis projection, Socket.IO delivery |
| `laravel-react-auction-web` | Tenant-bound BFF and bidder UI |
| `dotnet-blazor-operations-portal` | Global SystemAdministrator observation |
| `docker-dbap-platform` | Infrastructure and deployment configuration |

Contract extraction is intentionally deferred. Until that phase, the
integration-contract project and language-specific compatibility tests remain
in this repository; no copied contract sources or repository split is part of
BN5.
