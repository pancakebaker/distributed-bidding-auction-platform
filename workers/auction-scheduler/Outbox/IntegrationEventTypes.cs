// <copyright file="IntegrationEventTypes.cs" company="Distributed Bidding Auction Platform">
// Copyright (c) Distributed Bidding Auction Platform. Licensed under the MIT license.
// </copyright>
namespace auction_scheduler.Outbox;

/// <summary>
/// Defines integration event type names used by outbox producers.
/// </summary>
public static class IntegrationEventTypes
{
    /// <summary>
    /// Event type emitted when an auction closes.
    /// </summary>
    public const string AuctionClosed = "AuctionClosed";
    /// <summary>
    /// Event type emitted when a winner is selected for a closed auction.
    /// </summary>
    public const string WinnerSelected = "WinnerSelected";
}
