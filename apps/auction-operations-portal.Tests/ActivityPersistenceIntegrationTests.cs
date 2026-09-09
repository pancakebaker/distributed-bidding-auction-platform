using System.Text.Json;
using AuctionOperationsPortal.Contracts;
using AuctionOperationsPortal.Data;
using AuctionOperationsPortal.Persistence;
using Microsoft.EntityFrameworkCore;

namespace AuctionOperationsPortal.Tests;

public sealed class ActivityPersistenceIntegrationTests : IAsyncLifetime
{
    private const string ConnectionString = "Host=127.0.0.1;Port=55432;Database=auction_operations;Username=auction_app;Password=change_me_in_local_env";
    private AuctionOperationsDbContext db = null!;
    private ActivityPersistence persistence = null!;
    private static readonly Guid AuctionId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");

    public async Task InitializeAsync()
    {
        var options = new DbContextOptionsBuilder<AuctionOperationsDbContext>().UseNpgsql(ConnectionString).Options;
        db = new AuctionOperationsDbContext(options);
        await db.Database.MigrateAsync();
        await db.AuctionActivities.ExecuteDeleteAsync();
        persistence = new ActivityPersistence(db, TimeProvider.System);
    }

    public async Task DisposeAsync() => await db.DisposeAsync();

    [Fact]
    public async Task ValidActivity_Persists()
    {
        var id = Guid.NewGuid();
        var inserted = await persistence.PersistAsync(BidAccepted(id), CancellationToken.None);
        var activity = await db.AuctionActivities.SingleAsync();
        Assert.True(inserted);
        Assert.Equal(id, activity.EventId);
        Assert.Equal("corr-integration", activity.CorrelationId);
        Assert.Equal(16, activity.AggregateVersion);
        Assert.Equal(1250m, activity.Amount);
    }

    [Fact]
    public async Task DuplicateEventId_IsIdempotent()
    {
        var envelope = BidAccepted(Guid.NewGuid());
        Assert.True(await persistence.PersistAsync(envelope, CancellationToken.None));
        Assert.False(await persistence.PersistAsync(envelope, CancellationToken.None));
        Assert.Equal(1, await db.AuctionActivities.CountAsync());
    }

    [Fact]
    public async Task SameAggregateVersion_SiblingEventsBothPersist()
    {
        var closed = new IntegrationEventEnvelope(Guid.NewGuid(), "AuctionClosed", DateTimeOffset.UtcNow, "Auction", AuctionId, 16, "closed", Json(new { auctionId = AuctionId, closedAtUtc = DateTimeOffset.UtcNow, finalBidAmount = 1250m, finalBidderId = "bidder", auctionVersion = 16 }));
        var winner = new IntegrationEventEnvelope(Guid.NewGuid(), "WinnerSelected", DateTimeOffset.UtcNow, "Auction", AuctionId, 16, "winner", Json(new { auctionId = AuctionId, winningBidId = Guid.NewGuid(), winnerId = "bidder", amount = 1250m, selectedAtUtc = DateTimeOffset.UtcNow, auctionVersion = 16 }));
        Assert.True(await persistence.PersistAsync(closed, CancellationToken.None));
        Assert.True(await persistence.PersistAsync(winner, CancellationToken.None));
        Assert.Equal(2, await db.AuctionActivities.CountAsync());
    }

    private static IntegrationEventEnvelope BidAccepted(Guid eventId) => new(eventId, "BidAccepted", DateTimeOffset.UtcNow, "Auction", AuctionId, 16, "corr-integration", Json(new { bidId = Guid.NewGuid(), auctionId = AuctionId, bidderId = "bidder", amount = 1250m, occurredAtUtc = DateTimeOffset.UtcNow, auctionVersion = 16 }));
    private static JsonElement Json(object value) => JsonSerializer.SerializeToElement(value, new JsonSerializerOptions(JsonSerializerDefaults.Web));
}
