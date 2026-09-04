# Event Catalog

This is the initial planned event catalog. It documents contracts before implementation; no shared event package is introduced yet.

## Event Envelope

```json
{
  "eventId": "uuid",
  "eventType": "BidAccepted",
  "occurredAtUtc": "2026-09-05T00:00:00Z",
  "aggregateId": "auction-id",
  "aggregateVersion": 42,
  "correlationId": "request-or-workflow-id",
  "payload": {}
}
```

`eventId` supports idempotency by giving every consumer a stable identifier it can record and ignore if delivered again.

`aggregateVersion` supports ordering and stale-event detection by identifying the version of the aggregate that produced the event.

`correlationId` supports tracing flows across HTTP requests, outbox publishing, RabbitMQ delivery, workers, and live fan-out.

## Planned Events

| Event | Producer | Initial Purpose |
| --- | --- | --- |
| AuctionCreated | Bidding Service | Announces a new auction exists |
| AuctionUpdated | Bidding Service | Announces changed auction metadata or state |
| BidAccepted | Bidding Service | Announces a bid passed authoritative validation |
| BidRejected | Bidding Service | Announces a rejected bid attempt when useful for workflows or audit |
| AuctionClosed | Auction Scheduler/Bidding Service | Announces bidding has closed |
| WinnerSelected | Auction Scheduler/Bidding Service | Announces the selected winning bid |
| PaymentRequested | Billing Worker | Announces that payment collection has started |
| PaymentSucceeded | Billing Worker | Announces successful payment |
| PaymentFailed | Billing Worker | Announces failed payment |
