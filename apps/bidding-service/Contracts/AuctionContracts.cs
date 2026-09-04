namespace bidding_service.Contracts;

public sealed record AuctionSummaryResponse(
    Guid Id,
    string Title,
    decimal StartingPrice,
    decimal MinimumBidIncrement,
    decimal? CurrentBidAmount,
    string? CurrentBidderId,
    decimal MinimumValidBid,
    string Status,
    DateTimeOffset StartTimeUtc,
    DateTimeOffset EndTimeUtc,
    long Version);

public sealed record AuctionDetailResponse(
    Guid Id,
    string Title,
    string Description,
    decimal StartingPrice,
    decimal MinimumBidIncrement,
    decimal? CurrentBidAmount,
    string? CurrentBidderId,
    decimal MinimumValidBid,
    string Status,
    DateTimeOffset StartTimeUtc,
    DateTimeOffset EndTimeUtc,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset UpdatedAtUtc,
    long Version);

public sealed record BidResponse(
    Guid Id,
    Guid AuctionId,
    string BidderId,
    decimal Amount,
    DateTimeOffset CreatedAtUtc);

public sealed record PlaceBidRequest(string BidderId, decimal Amount);

public sealed record PlaceBidResponse(
    Guid BidId,
    Guid AuctionId,
    string BidderId,
    decimal Amount,
    decimal CurrentBidAmount,
    string CurrentBidderId,
    decimal NextMinimumBid,
    long AuctionVersion,
    DateTimeOffset CreatedAtUtc);

public sealed record ApiErrorResponse(string Code, string Message, object? Details = null);

public sealed record BidRuleErrorDetails(decimal? CurrentBidAmount, decimal MinimumValidBid, long AuctionVersion);
