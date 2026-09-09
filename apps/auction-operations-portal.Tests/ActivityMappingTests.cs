using System.Text.Json;
using AuctionOperationsPortal.Contracts;
using AuctionOperationsPortal.Persistence;

namespace AuctionOperationsPortal.Tests;

public sealed class ActivityMappingTests
{
    private static readonly Guid AuctionId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static IntegrationEventEnvelope Envelope(string type, JsonElement payload) => new(Guid.NewGuid(), type, DateTimeOffset.UtcNow, "Auction", AuctionId, 16, "corr-1", payload);
    private static JsonElement Json(object value) => JsonSerializer.SerializeToElement(value, new JsonSerializerOptions(JsonSerializerDefaults.Web));

    [Fact]
    public void BidAccepted_MapsRelevantFields()
    {
        var result = IntegrationEventMapper.ToActivity(Envelope("BidAccepted", Json(new { bidId = Guid.NewGuid(), auctionId = AuctionId, bidderId = "bidder", amount = 12.50m, occurredAtUtc = DateTimeOffset.UtcNow, auctionVersion = 16 })), DateTimeOffset.UtcNow);
        Assert.Equal("bidder", result.BidderId); Assert.Equal(12.50m, result.Amount); Assert.NotNull(result.BidId); Assert.Equal("corr-1", result.CorrelationId); Assert.Equal(16, result.AggregateVersion);
    }

    [Fact]
    public void AuctionClosed_MapsRelevantFields()
    {
        var result = IntegrationEventMapper.ToActivity(Envelope("AuctionClosed", Json(new { auctionId = AuctionId, closedAtUtc = DateTimeOffset.UtcNow, finalBidAmount = 20m, finalBidderId = "winner", auctionVersion = 16 })), DateTimeOffset.UtcNow);
        Assert.Equal("winner", result.BidderId); Assert.Equal(20m, result.Amount);
    }

    [Fact]
    public void WinnerSelected_MapsRelevantFields()
    {
        var bidId = Guid.NewGuid();
        var result = IntegrationEventMapper.ToActivity(Envelope("WinnerSelected", Json(new { auctionId = AuctionId, winningBidId = bidId, winnerId = "winner", amount = 20m, selectedAtUtc = DateTimeOffset.UtcNow, auctionVersion = 16 })), DateTimeOffset.UtcNow);
        Assert.Equal(bidId, result.BidId); Assert.Equal("winner", result.WinnerId); Assert.Equal(20m, result.Amount);
    }

    [Fact]
    public void SameAggregateVersion_DoesNotAffectEventIdentity()
    {
        var closed = IntegrationEventMapper.ToActivity(Envelope("AuctionClosed", Json(new { auctionId = AuctionId, closedAtUtc = DateTimeOffset.UtcNow, finalBidAmount = 20m, finalBidderId = "winner", auctionVersion = 16 })), DateTimeOffset.UtcNow);
        var winner = IntegrationEventMapper.ToActivity(Envelope("WinnerSelected", Json(new { auctionId = AuctionId, winningBidId = Guid.NewGuid(), winnerId = "winner", amount = 20m, selectedAtUtc = DateTimeOffset.UtcNow, auctionVersion = 16 })), DateTimeOffset.UtcNow);
        Assert.NotEqual(closed.EventId, winner.EventId); Assert.Equal(closed.AggregateVersion, winner.AggregateVersion);
    }
}
