using DistributedBidding.IntegrationContracts;

namespace bidding_service.Tests;

public sealed class IntegrationEventContractTests
{
    [Fact]
    public void WireValuesRemainStable()
    {
        Assert.Equal("BidAccepted", IntegrationEventTypes.BidAccepted);
        Assert.Equal("AuctionClosed", IntegrationEventTypes.AuctionClosed);
        Assert.Equal("WinnerSelected", IntegrationEventTypes.WinnerSelected);
        Assert.Equal("Auction", AggregateTypes.Auction);
        Assert.Equal("auction.bid.accepted", IntegrationEventRoutingKeys.BidAccepted);
        Assert.Equal("auction.closed", IntegrationEventRoutingKeys.AuctionClosed);
        Assert.Equal("auction.winner.selected", IntegrationEventRoutingKeys.WinnerSelected);
    }
}
