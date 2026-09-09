using AuctionOperationsPortal.Data;
using AuctionOperationsPortal.Persistence;
using Microsoft.EntityFrameworkCore;

namespace AuctionOperationsPortal.Tests;

public sealed class ActivityHistoryQueryValidationTests
{
    private static readonly int[] AllowedPageSizes = [25, 50, 100];

    [Fact]
    public void ValidQuery_IsAccepted()
    {
        var query = new ActivityHistoryQuery(DateTimeOffset.UtcNow.AddHours(-1), DateTimeOffset.UtcNow, null, "BidAccepted", 1, 25);

        Assert.Empty(query.Validate());
    }

    [Fact]
    public void InvalidRangeAndPageOptions_AreRejected()
    {
        var query = new ActivityHistoryQuery(DateTimeOffset.UtcNow, DateTimeOffset.UtcNow.AddDays(-1), null, "Unknown", 0, 10);
        var maximumRangeQuery = new ActivityHistoryQuery(DateTimeOffset.UtcNow.AddDays(-32), DateTimeOffset.UtcNow, null, null);

        var errors = query.Validate();

        Assert.Contains(errors, error => error.Contains("earlier", StringComparison.Ordinal));
        Assert.Contains(maximumRangeQuery.Validate(), error => error.Contains("31 days", StringComparison.Ordinal));
        Assert.Contains(errors, error => error.Contains("Event Type", StringComparison.Ordinal));
        Assert.Contains(errors, error => error.Contains("Page must", StringComparison.Ordinal));
        Assert.Contains(errors, error => error.Contains("Page size", StringComparison.Ordinal));
    }

    [Fact]
    public void Parser_RejectsMalformedTimestampAndAggregateId()
    {
        var parsed = ActivityHistoryQueryParser.Parse("not-a-time", "2026-09-09T00:00:00Z", "not-a-guid", null, "1", "25");

        Assert.False(parsed.IsValid);
        Assert.Contains(parsed.Errors, error => error.Contains("From", StringComparison.Ordinal));
        Assert.Contains(parsed.Errors, error => error.Contains("GUID", StringComparison.Ordinal));
    }

    [Fact]
    public void AllowedPageSizes_AreExplicit()
    {
        Assert.All(AllowedPageSizes, pageSize => Assert.Empty(new ActivityHistoryQuery(DateTimeOffset.UtcNow.AddHours(-1), DateTimeOffset.UtcNow, null, null, 1, pageSize).Validate()));
        Assert.NotEmpty(new ActivityHistoryQuery(DateTimeOffset.UtcNow.AddHours(-1), DateTimeOffset.UtcNow, null, null, 1, 20).Validate());
    }
}

[Collection("PortalDatabase")]
public sealed class ActivityHistoryQueryIntegrationTests : IAsyncLifetime
{
    private const string ConnectionString = "Host=127.0.0.1;Port=55432;Database=auction_operations;Username=auction_app;Password=change_me_in_local_env";
    private AuctionOperationsDbContext db = null!;
    private ActivityHistoryQueryService query = null!;
    private static readonly Guid AuctionId = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");

    public async Task InitializeAsync()
    {
        var options = new DbContextOptionsBuilder<AuctionOperationsDbContext>().UseNpgsql(ConnectionString).Options;
        db = new AuctionOperationsDbContext(options);
        await db.Database.MigrateAsync();
        await db.AuctionActivities.ExecuteDeleteAsync();
        query = new ActivityHistoryQueryService(db);
    }

    public async Task DisposeAsync() => await db.DisposeAsync();

    [Fact]
    public async Task Search_AppliesDateAggregateAndEventFiltersIncludingBoundaries()
    {
        var from = DateTimeOffset.UtcNow.AddHours(-2);
        var to = DateTimeOffset.UtcNow;
        await AddAsync("BidAccepted", AuctionId, 10, from, "inside");
        await AddAsync("AuctionClosed", AuctionId, 11, to, "inside");
        await AddAsync("WinnerSelected", Guid.NewGuid(), 11, to, "other");

        var page = await query.SearchAsync(new ActivityHistoryQuery(from.AddTicks(-1), to.AddTicks(1), AuctionId, "AuctionClosed"), CancellationToken.None);

        var activity = Assert.Single(page.Items);
        Assert.Equal("inside", activity.CorrelationId);
        Assert.Equal(1, page.TotalCount);
    }

    [Fact]
    public async Task Search_PaginatesAndOrdersTiesByIdDescending()
    {
        var occurred = DateTimeOffset.UtcNow;
        for (var index = 0; index < 26; index++)
            await AddAsync("BidAccepted", AuctionId, index + 1, occurred, $"row-{index}");

        var first = await query.SearchAsync(new ActivityHistoryQuery(occurred.AddTicks(-1), occurred.AddTicks(1), null, null, 1, 25), CancellationToken.None);
        var second = await query.SearchAsync(new ActivityHistoryQuery(occurred.AddTicks(-1), occurred.AddTicks(1), null, null, 2, 25), CancellationToken.None);

        Assert.Equal(25, first.Items.Count);
        Assert.Single(second.Items);
        Assert.Equal(26, first.TotalCount);
        Assert.Equal(2, first.TotalPages);
        Assert.True(first.Items[0].Id > first.Items[1].Id);
        Assert.Equal("row-25", first.Items[0].CorrelationId);
        Assert.Equal("row-0", second.Items[0].CorrelationId);

        var beyondLastPage = await query.SearchAsync(new ActivityHistoryQuery(occurred.AddTicks(-1), occurred.AddTicks(1), null, null, 3, 25), CancellationToken.None);
        Assert.Empty(beyondLastPage.Items);
        Assert.Equal(2, beyondLastPage.TotalPages);
    }

    [Fact]
    public async Task Search_KeepsSameVersionSiblingEventsVisible()
    {
        var occurred = DateTimeOffset.UtcNow;
        await AddAsync("AuctionClosed", AuctionId, 16, occurred, "closed");
        await AddAsync("WinnerSelected", AuctionId, 16, occurred, "winner");

        var page = await query.SearchAsync(new ActivityHistoryQuery(occurred.AddTicks(-1), occurred.AddTicks(1), AuctionId, null), CancellationToken.None);

        Assert.Equal(2, page.Items.Count);
        Assert.Contains(page.Items, activity => activity.EventType == "AuctionClosed" && activity.AggregateVersion == 16);
        Assert.Contains(page.Items, activity => activity.EventType == "WinnerSelected" && activity.AggregateVersion == 16);
    }

    private async Task AddAsync(string eventType, Guid aggregateId, long version, DateTimeOffset occurredAt, string correlationId)
    {
        db.AuctionActivities.Add(new AuctionActivity
        {
            EventId = Guid.NewGuid(),
            EventType = eventType,
            AggregateType = "Auction",
            AggregateId = aggregateId,
            AggregateVersion = version,
            CorrelationId = correlationId,
            OccurredAtUtc = occurredAt,
            ProcessedAtUtc = occurredAt,
            Amount = 1250m
        });
        await db.SaveChangesAsync();
    }
}
