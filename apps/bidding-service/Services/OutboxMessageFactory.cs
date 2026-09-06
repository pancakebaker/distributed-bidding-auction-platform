// <copyright file="OutboxMessageFactory.cs" company="Distributed Bidding Auction Platform">
// Copyright (c) Distributed Bidding Auction Platform. Licensed under the MIT license.
// </copyright>
using System.Text.Json;
using bidding_service.Domain;

namespace bidding_service.Services;

/// <summary>
/// Creates explicit outbox messages for accepted bidding events.
/// </summary>
public static class OutboxMessageFactory
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    /// <summary>
    /// Creates a BidAccepted outbox message for a committed bid.
    /// </summary>
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

/// <summary>
/// Defines integration event type names used by outbox producers.
/// </summary>
public static class IntegrationEventTypes
{
    /// <summary>
    /// Event type emitted when a bid is accepted.
    /// </summary>
    public const string BidAccepted = "BidAccepted";
}

/// <summary>
/// Represents the BidAccepted event payload persisted to the outbox.
/// </summary>
public sealed record BidAcceptedPayload(
    Guid BidId,
    Guid AuctionId,
    string BidderId,
    decimal Amount,
    DateTimeOffset OccurredAtUtc,
    long AuctionVersion);
