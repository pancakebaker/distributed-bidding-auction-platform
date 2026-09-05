using System.Text.Json;
using bidding_service.Domain;

namespace bidding_service.Services;

public static class OutboxMessageFactory
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public static OutboxMessage BidAccepted(Bid bid, Auction auction, string correlationId, DateTimeOffset occurredAtUtc)
    {
        var payload = new BidAcceptedPayload(
            bid.Id,
            auction.Id,
            bid.BidderId,
            bid.Amount,
            occurredAtUtc,
            auction.Version);

        return new OutboxMessage
        {
            Id = Guid.NewGuid(),
            EventType = IntegrationEventTypes.BidAccepted,
            AggregateType = nameof(Auction),
            AggregateId = auction.Id,
            AggregateVersion = auction.Version,
            OccurredAtUtc = occurredAtUtc,
            CorrelationId = correlationId,
            Payload = JsonSerializer.Serialize(payload, JsonOptions),
            CreatedAtUtc = occurredAtUtc,
            PublishedAtUtc = null,
            PublishAttempts = 0,
            LastError = null
        };
    }
}

public static class IntegrationEventTypes
{
    public const string BidAccepted = "BidAccepted";
}

public sealed record BidAcceptedPayload(
    Guid BidId,
    Guid AuctionId,
    string BidderId,
    decimal Amount,
    DateTimeOffset OccurredAtUtc,
    long AuctionVersion);
