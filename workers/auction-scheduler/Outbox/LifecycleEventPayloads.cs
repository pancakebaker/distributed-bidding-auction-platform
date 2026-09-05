namespace auction_scheduler.Outbox;

public sealed record AuctionClosedPayload(
    Guid AuctionId,
    DateTimeOffset ClosedAtUtc,
    decimal? FinalBidAmount,
    string? FinalBidderId,
    long AuctionVersion);

public sealed record WinnerSelectedPayload(
    Guid AuctionId,
    Guid WinningBidId,
    string WinnerId,
    decimal Amount,
    DateTimeOffset SelectedAtUtc,
    long AuctionVersion);
