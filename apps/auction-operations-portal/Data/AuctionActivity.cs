// <copyright file="AuctionActivity.cs" company="Distributed Bidding Auction Platform">
// Copyright (c) Distributed Bidding Auction Platform. Licensed under the MIT license.
// </copyright>
namespace AuctionOperationsPortal.Data;

/// <summary>Stores the durable operational projection of an auction event.</summary>
public sealed class AuctionActivity
{
    /// <summary>Gets or sets the database identifier.</summary>
    public long Id { get; set; }
    /// <summary>Gets or sets the source event identifier.</summary>
    public Guid EventId { get; set; }
    /// <summary>Gets or sets the source event type.</summary>
    public required string EventType { get; set; }
    /// <summary>Gets or sets the source aggregate type.</summary>
    public required string AggregateType { get; set; }
    /// <summary>Gets or sets the source aggregate identifier.</summary>
    public Guid AggregateId { get; set; }
    /// <summary>Gets or sets the source aggregate version.</summary>
    public long AggregateVersion { get; set; }
    /// <summary>Gets or sets the optional correlation identifier.</summary>
    public string? CorrelationId { get; set; }
    /// <summary>Gets or sets the event occurrence time in UTC.</summary>
    public DateTimeOffset OccurredAtUtc { get; set; }
    /// <summary>Gets or sets the projection processing time in UTC.</summary>
    public DateTimeOffset ProcessedAtUtc { get; set; }
    /// <summary>Gets or sets the optional bid identifier.</summary>
    public Guid? BidId { get; set; }
    /// <summary>Gets or sets the bidder identity when present.</summary>
    public string? BidderId { get; set; }
    /// <summary>Gets or sets the bid or winning amount when present.</summary>
    public decimal? Amount { get; set; }
    /// <summary>Gets or sets the winner identity when present.</summary>
    public string? WinnerId { get; set; }
    /// <summary>Gets or sets safe, non-sensitive event metadata.</summary>
    public string? SafeMetadataJson { get; set; }
}
