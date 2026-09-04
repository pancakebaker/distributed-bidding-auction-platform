namespace bidding_service.Domain;

public sealed class Auction
{
    public Guid Id { get; set; }
    public required string Title { get; set; }
    public required string Description { get; set; }
    public decimal StartingPrice { get; set; }
    public decimal MinimumBidIncrement { get; set; }
    public decimal? CurrentBidAmount { get; set; }
    public string? CurrentBidderId { get; set; }
    public DateTimeOffset StartTimeUtc { get; set; }
    public DateTimeOffset EndTimeUtc { get; set; }
    public AuctionStatus Status { get; set; }
    public long Version { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; }
    public DateTimeOffset UpdatedAtUtc { get; set; }
    public List<Bid> Bids { get; set; } = [];
}
