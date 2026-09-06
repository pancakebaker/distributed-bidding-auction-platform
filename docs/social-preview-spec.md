# GitHub Social Preview Specification

Recommended canvas: 1280x640.

## Text

Primary title:

```text
Distributed Bidding
Auction Platform
```

Supporting lines:

```text
Concurrency-safe bidding
RabbitMQ | Redis | Socket.IO | PostgreSQL
.NET • Laravel • React
```

## Visual Direction

Use a clean engineering-demo composition:

- left side: project title and technology line
- right side: one of the captured auction screenshots as a thumbnail or a compact architecture flow
- subtle dark/neutral background with high contrast text
- no fake revenue, fake user counts, or decorative dashboard metrics

## Suggested Architecture Motif

```text
Client -> Bidding API -> PostgreSQL Outbox -> RabbitMQ -> Live Feed -> Socket.IO
                         ^
                  Auction Scheduler
```

This file is a specification only. Do not add a generated social preview image until a real asset is produced and reviewed.


