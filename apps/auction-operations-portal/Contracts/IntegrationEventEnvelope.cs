using System.Text.Json;

namespace AuctionOperationsPortal.Contracts;

public sealed record IntegrationEventEnvelope(
    Guid EventId,
    string EventType,
    DateTimeOffset OccurredAtUtc,
    string AggregateType,
    Guid AggregateId,
    long AggregateVersion,
    string? CorrelationId,
    JsonElement Payload);

public sealed record BidAcceptedPayload(Guid BidId, Guid AuctionId, string BidderId, decimal Amount, DateTimeOffset OccurredAtUtc, long AuctionVersion);
public sealed record AuctionClosedPayload(Guid AuctionId, DateTimeOffset ClosedAtUtc, decimal? FinalBidAmount, string? FinalBidderId, long AuctionVersion);
public sealed record WinnerSelectedPayload(Guid AuctionId, Guid WinningBidId, string WinnerId, decimal Amount, DateTimeOffset SelectedAtUtc, long AuctionVersion);
