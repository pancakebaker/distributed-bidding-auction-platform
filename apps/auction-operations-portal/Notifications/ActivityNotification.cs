// <copyright file="ActivityNotification.cs" company="Distributed Bidding Auction Platform">
// Copyright (c) Distributed Bidding Auction Platform. Licensed under the MIT license.
// </copyright>
using AuctionOperationsPortal.Data;

namespace AuctionOperationsPortal.Notifications;

/// <summary>Represents the safe activity payload sent to live portal clients.</summary>
public sealed record ActivityNotification(
    long Id,
    Guid EventId,
    Guid TenantId,
    string EventType,
    Guid AggregateId,
    long AggregateVersion,
    string? CorrelationId,
    DateTimeOffset OccurredAtUtc,
    DateTimeOffset ProcessedAtUtc,
    string? BidderId,
    decimal? Amount,
    string? WinnerId)
{
    /// <summary>Creates a client notification from the persisted activity projection.</summary>
    public static ActivityNotification From(AuctionActivity activity) => new(
        activity.Id,
        activity.EventId,
        activity.TenantId,
        activity.EventType,
        activity.AggregateId,
        activity.AggregateVersion,
        activity.CorrelationId,
        activity.OccurredAtUtc,
        activity.ProcessedAtUtc,
        activity.BidderId,
        activity.Amount,
        activity.WinnerId);

    /// <summary>Gets the human-readable operational label for the event.</summary>
    public string DisplayEventType => GetDisplayEventType(EventType);

    /// <summary>Gets the human-readable label for a persisted event type.</summary>
    public static string GetDisplayEventType(string eventType) => eventType switch
    {
        "AuctionPurchased" => "Buy Now purchase",
        "BidAccepted" => "Bid accepted",
        "AuctionClosed" => "Auction closed",
        "WinnerSelected" => "Winner selected",
        "TenantStatusChanged" => "Tenant status changed",
        _ => eventType
    };

    /// <summary>Gets the operational winner or bidder identity when present.</summary>
    public string? DisplayWinner => WinnerId ?? BidderId;
}
