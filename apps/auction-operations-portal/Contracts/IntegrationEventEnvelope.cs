// <copyright file="IntegrationEventEnvelope.cs" company="Distributed Bidding Auction Platform">
// Copyright (c) Distributed Bidding Auction Platform. Licensed under the MIT license.
// </copyright>
using System.Text.Json;

namespace AuctionOperationsPortal.Contracts;

/// <summary>Represents the validated envelope received from the auction event stream.</summary>
public sealed record IntegrationEventEnvelope(
    Guid EventId,
    string EventType,
    DateTimeOffset OccurredAtUtc,
    string AggregateType,
    Guid AggregateId,
    long AggregateVersion,
    string? CorrelationId,
    JsonElement Payload);

/// <summary>Contains the payload for an accepted bid event.</summary>
public sealed record BidAcceptedPayload(
    Guid BidId,
    Guid AuctionId,
    string BidderId,
    decimal Amount,
    DateTimeOffset OccurredAtUtc,
    long AuctionVersion);

/// <summary>Contains the payload for an auction-closed event.</summary>
public sealed record AuctionClosedPayload(
    Guid AuctionId,
    DateTimeOffset ClosedAtUtc,
    decimal? FinalBidAmount,
    string? FinalBidderId,
    long AuctionVersion);

/// <summary>Contains the payload for a winner-selected event.</summary>
public sealed record WinnerSelectedPayload(
    Guid AuctionId,
    Guid WinningBidId,
    string WinnerId,
    decimal Amount,
    DateTimeOffset SelectedAtUtc,
    long AuctionVersion);
