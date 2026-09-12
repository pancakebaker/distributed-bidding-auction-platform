// <copyright file="OutboxMessageFactory.cs" company="Distributed Bidding Auction Platform">
// Copyright (c) Distributed Bidding Auction Platform. Licensed under the MIT license.
// </copyright>
using System.Text.Json;
using bidding_service.Domain;
using DistributedBidding.IntegrationContracts;

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
    public static OutboxMessage BidAccepted(
        Bid bid,
        Auction auction,
        string correlationId,
        DateTimeOffset occurredAtUtc)
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
            AggregateType = AggregateTypes.Auction,
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

    /// <summary>
    /// Creates an AuctionPurchased outbox message for an explicit Buy Now purchase.
    /// </summary>
    public static OutboxMessage AuctionPurchased(
        Auction auction,
        string bidderId,
        string correlationId,
        DateTimeOffset occurredAtUtc)
    {
        var payload = new AuctionPurchasedPayload(
            auction.Id,
            bidderId,
            auction.FinalPrice!.Value,
            occurredAtUtc,
            auction.Version);

        return CreateLifecycleMessage(
            IntegrationEventTypes.AuctionPurchased,
            auction,
            correlationId,
            occurredAtUtc,
            payload);
    }

    /// <summary>
    /// Creates an AuctionClosed outbox message for an explicit Buy Now purchase.
    /// </summary>
    public static OutboxMessage AuctionClosed(
        Auction auction,
        string correlationId,
        DateTimeOffset occurredAtUtc)
    {
        var payload = new AuctionClosedPayload(
            auction.Id,
            occurredAtUtc,
            auction.FinalPrice,
            auction.FinalWinnerId,
            auction.Version);

        return CreateLifecycleMessage(
            IntegrationEventTypes.AuctionClosed,
            auction,
            correlationId,
            occurredAtUtc,
            payload);
    }

    private static OutboxMessage CreateLifecycleMessage<TPayload>(
        string eventType,
        Auction auction,
        string correlationId,
        DateTimeOffset occurredAtUtc,
        TPayload payload)
    {
        return new OutboxMessage
        {
            Id = Guid.NewGuid(),
            EventType = eventType,
            AggregateType = AggregateTypes.Auction,
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
/// Represents the BidAccepted event payload persisted to the outbox.
/// </summary>
public sealed record BidAcceptedPayload(
    Guid BidId,
    Guid AuctionId,
    string BidderId,
    decimal Amount,
    DateTimeOffset OccurredAtUtc,
    long AuctionVersion);

/// <summary>
/// Represents the explicit Buy Now purchase event payload persisted to the outbox.
/// </summary>
public sealed record AuctionPurchasedPayload(
    Guid AuctionId,
    string BidderId,
    decimal FinalPrice,
    DateTimeOffset PurchasedAtUtc,
    long AuctionVersion);

/// <summary>
/// Represents an auction close event emitted by the bidding service for Buy Now.
/// </summary>
public sealed record AuctionClosedPayload(
    Guid AuctionId,
    DateTimeOffset ClosedAtUtc,
    decimal? FinalBidAmount,
    string? FinalBidderId,
    long AuctionVersion);
