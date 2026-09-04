namespace bidding_service.Domain;

public sealed class Bid
{
    public Guid Id { get; set; }
    public Guid AuctionId { get; set; }
    public required string BidderId { get; set; }
    public decimal Amount { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; }
    public Auction? Auction { get; set; }
}
