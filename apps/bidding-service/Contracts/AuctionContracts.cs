// <copyright file="AuctionContracts.cs" company="Distributed Bidding Auction Platform">
// Copyright (c) Distributed Bidding Auction Platform. Licensed under the MIT license.
// </copyright>
namespace bidding_service.Contracts;

/// <summary>
/// Summarizes auction state for list views.
/// </summary>
public sealed record AuctionSummaryResponse(
    Guid Id,
    string Title,
    decimal StartingPrice,
    string SaleMode,
    decimal? BuyNowPrice,
    decimal MinimumBidIncrement,
    decimal? CurrentBidAmount,
    string? CurrentBidderId,
    string? FinalWinnerId,
    decimal? FinalPrice,
    decimal MinimumValidBid,
    string Status,
    DateTimeOffset StartTimeUtc,
    DateTimeOffset EndTimeUtc,
    long Version);

/// <summary>
/// Returns detailed auction state for the auction detail view.
/// </summary>
public sealed record AuctionDetailResponse(
    Guid Id,
    string Title,
    string Description,
    decimal StartingPrice,
    string SaleMode,
    decimal? BuyNowPrice,
    decimal MinimumBidIncrement,
    decimal? CurrentBidAmount,
    string? CurrentBidderId,
    string? FinalWinnerId,
    decimal? FinalPrice,
    decimal MinimumValidBid,
    string Status,
    DateTimeOffset StartTimeUtc,
    DateTimeOffset EndTimeUtc,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset UpdatedAtUtc,
    long Version);

/// <summary>
/// Describes an accepted bid returned by the bidding API.
/// </summary>
public sealed record BidResponse(
    Guid Id,
    Guid AuctionId,
    string BidderId,
    decimal Amount,
    DateTimeOffset CreatedAtUtc);

/// <summary>
/// Carries a bidder identity and bid amount for bid placement.
/// </summary>
public sealed record PlaceBidRequest(string BidderId, decimal Amount);

/// <summary>
/// Describes the accepted bid and resulting auction state.
/// </summary>
public sealed record PlaceBidResponse(
    Guid BidId,
    Guid AuctionId,
    string BidderId,
    decimal Amount,
    decimal CurrentBidAmount,
    string CurrentBidderId,
    decimal NextMinimumBid,
    long AuctionVersion,
    DateTimeOffset CreatedAtUtc,
    string CorrelationId);

/// <summary>
/// Provides a stable error shape for API clients.
/// </summary>
public sealed record ApiErrorResponse(string Code, string Message, object? Details = null);

/// <summary>
/// Provides current auction values that help clients correct rejected bids.
/// </summary>
public sealed record BidRuleErrorDetails(
    decimal? CurrentBidAmount,
    decimal MinimumValidBid,
    long AuctionVersion);


