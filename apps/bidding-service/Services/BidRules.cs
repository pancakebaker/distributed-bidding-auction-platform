using bidding_service.Domain;

namespace bidding_service.Services;

public static class BidRules
{
    public static decimal GetMinimumValidBid(Auction auction)
    {
        return auction.CurrentBidAmount is null
            ? auction.StartingPrice
            : auction.CurrentBidAmount.Value + auction.MinimumBidIncrement;
    }
}
