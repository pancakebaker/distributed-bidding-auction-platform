// <copyright file="IntegrationEventEnvelope.cs" company="Distributed Bidding Auction Platform">
// Copyright (c) Distributed Bidding Auction Platform. Licensed under the MIT license.
// </copyright>
using System.Text.Json;
using System.Text.Json.Serialization;

namespace AuctionOperationsPortal.Contracts;

/// <summary>Represents the validated envelope received from the auction event stream.</summary>
[method: JsonConstructor]
public sealed partial record IntegrationEventEnvelope(
    Guid EventId,
    string EventType,
    DateTimeOffset OccurredAtUtc,
    string AggregateType,
    Guid AggregateId,
    long AggregateVersion,
    string? CorrelationId,
    Guid TenantId,
    JsonElement Payload);

// The short constructor is retained for existing in-process test fixtures. Wire messages must
// use the primary constructor and carry tenantId explicitly.
public sealed partial record IntegrationEventEnvelope
{
    private static readonly Guid LegacyFixtureTenantId =
        Guid.Parse("aaaaaaaa-1111-4111-8111-111111111111");

    /// <summary>Initializes a new instance of the <see cref="IntegrationEventEnvelope"/> class using the local demo tenant.</summary>
    public IntegrationEventEnvelope(
        Guid eventId,
        string eventType,
        DateTimeOffset occurredAtUtc,
        string aggregateType,
        Guid aggregateId,
        long aggregateVersion,
        string? correlationId,
        JsonElement payload)
        : this(
            eventId,
            eventType,
            occurredAtUtc,
            aggregateType,
            aggregateId,
            aggregateVersion,
            correlationId,
            LegacyFixtureTenantId,
            payload)
    {
    }
}

/// <summary>Contains the payload for an accepted bid event.</summary>
public sealed record BidAcceptedPayload(
    Guid TenantId,
    Guid BidId,
    Guid AuctionId,
    string BidderId,
    decimal Amount,
    DateTimeOffset OccurredAtUtc,
    long AuctionVersion);

/// <summary>Contains the payload for an auction-closed event.</summary>
public sealed record AuctionClosedPayload(
    Guid TenantId,
    Guid AuctionId,
    DateTimeOffset ClosedAtUtc,
    decimal? FinalBidAmount,
    string? FinalBidderId,
    long AuctionVersion);

/// <summary>Contains the payload for a winner-selected event.</summary>
public sealed record WinnerSelectedPayload(
    Guid TenantId,
    Guid AuctionId,
    Guid WinningBidId,
    string WinnerId,
    decimal Amount,
    DateTimeOffset SelectedAtUtc,
    long AuctionVersion);

/// <summary>Contains the payload for an explicit Buy Now purchase event.</summary>
public sealed record AuctionPurchasedPayload(
    Guid TenantId,
    Guid AuctionId,
    string BidderId,
    decimal FinalPrice,
    DateTimeOffset PurchasedAtUtc,
    long AuctionVersion);

/// <summary>Contains the payload for an explicit auction cancellation.</summary>
public sealed record AuctionCancelledPayload(Guid TenantId, Guid AuctionId);
