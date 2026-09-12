using System.Text.Json;
using bidding_service.Domain;
using bidding_service.Services;
using DistributedBidding.IntegrationContracts;

namespace bidding_service.Tests;

public sealed class IntegrationEventContractTests
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    [Fact]
    public void WireValuesRemainStable()
    {
        Assert.Equal("BidAccepted", IntegrationEventTypes.BidAccepted);
        Assert.Equal("AuctionClosed", IntegrationEventTypes.AuctionClosed);
        Assert.Equal("WinnerSelected", IntegrationEventTypes.WinnerSelected);
        Assert.Equal("AuctionPurchased", IntegrationEventTypes.AuctionPurchased);
        Assert.Equal("Auction", AggregateTypes.Auction);
        Assert.Equal("auction.bid.accepted", IntegrationEventRoutingKeys.BidAccepted);
        Assert.Equal("auction.closed", IntegrationEventRoutingKeys.AuctionClosed);
        Assert.Equal("auction.winner.selected", IntegrationEventRoutingKeys.WinnerSelected);
        Assert.Equal("auction.purchased", IntegrationEventRoutingKeys.AuctionPurchased);
    }

    [Fact]
    public void AuctionPurchasedPayloadAndSiblingEnvelopePreserveAuthoritativeFields()
    {
        var auctionId = Guid.NewGuid();
        var occurredAtUtc = DateTimeOffset.UtcNow;
        var auction = new Auction
        {
            Id = auctionId,
            Title = "Contract test auction",
            Description = "Contract test",
            FinalWinnerId = "buyer-123",
            FinalPrice = 1500m,
            Version = 9
        };

        var purchased = OutboxMessageFactory.AuctionPurchased(
            auction,
            "buyer-123",
            "correlation-123",
            occurredAtUtc);
        var closed = OutboxMessageFactory.AuctionClosed(
            auction,
            "correlation-123",
            occurredAtUtc.AddMilliseconds(1));
        var payload = JsonSerializer.Deserialize<AuctionPurchasedPayload>(purchased.Payload, JsonOptions);

        Assert.NotNull(payload);
        Assert.Equal(auctionId, payload.AuctionId);
        Assert.Equal("buyer-123", payload.BidderId);
        Assert.Equal(1500m, payload.FinalPrice);
        Assert.Equal(9, payload.AuctionVersion);
        Assert.Equal(IntegrationEventTypes.AuctionPurchased, purchased.EventType);
        Assert.Equal(IntegrationEventTypes.AuctionClosed, closed.EventType);
        Assert.Equal(auctionId, purchased.AggregateId);
        Assert.Equal(9, purchased.AggregateVersion);
        Assert.Equal(purchased.AggregateVersion, closed.AggregateVersion);
        Assert.Equal(occurredAtUtc, purchased.OccurredAtUtc);
        Assert.Equal("correlation-123", purchased.CorrelationId);
        Assert.Equal("correlation-123", closed.CorrelationId);
        Assert.NotEqual(purchased.Id, closed.Id);
    }
}
