using AuctionOperationsPortal.Data;
using AuctionOperationsPortal.Persistence;
using Microsoft.EntityFrameworkCore;

namespace AuctionOperationsPortal.Tests;

public sealed class ActivityReportValidationTests
{
    [Fact]
    public void ReportRequest_ReusesHistoryValidationRules()
    {
        var request = new ActivityReportRequest(DateTimeOffset.UtcNow, DateTimeOffset.UtcNow.AddDays(-1), null, "Unknown");

        var errors = request.Validate();

        Assert.Contains(errors, error => error.Contains("earlier", StringComparison.Ordinal));
        Assert.Contains(errors, error => error.Contains("Event Type", StringComparison.Ordinal));
    }
}

[Collection("PortalDatabase")]
public sealed class ActivityReportIntegrationTests : IAsyncLifetime
{
    private const string ConnectionString = "Host=127.0.0.1;Port=55432;Database=auction_operations;Username=auction_app;Password=change_me_in_local_env";
    private AuctionOperationsDbContext db = null!;
    private ActivityReportService reports = null!;
    private static readonly Guid AuctionId = Guid.Parse("cccccccc-cccc-cccc-cccc-cccccccccccc");

    public async Task InitializeAsync()
    {
        var options = new DbContextOptionsBuilder<AuctionOperationsDbContext>().UseNpgsql(ConnectionString).Options;
        db = new AuctionOperationsDbContext(options);
        await db.Database.MigrateAsync();
        await db.AuctionActivities.ExecuteDeleteAsync();
        reports = new ActivityReportService(db);
    }

    public async Task DisposeAsync() => await db.DisposeAsync();

    [Fact]
    public async Task Build_ComputesFilteredSummaryAndChronologicalRows()
    {
        var occurred = DateTimeOffset.UtcNow;
        await AddAsync("WinnerSelected", occurred.AddMinutes(1), 16, "winner");
        await AddAsync("AuctionClosed", occurred, 16, "closed");
        await AddAsync("BidAccepted", occurred.AddMinutes(-1), 15, "bid");
        await AddAsync("BidAccepted", occurred, 15, "other-auction", Guid.NewGuid());

        var report = await reports.BuildAsync(new ActivityReportRequest(occurred.AddMinutes(-1), occurred.AddMinutes(1), AuctionId, null), CancellationToken.None);

        Assert.Equal(3, report.Summary.TotalCount);
        Assert.Equal(1, report.Summary.Counts["BidAccepted"]);
        Assert.Equal(1, report.Summary.Counts["AuctionClosed"]);
        Assert.Equal(1, report.Summary.Counts["WinnerSelected"]);
        Assert.Equal("bid", report.Items[0].CorrelationId);
        Assert.Equal("winner", report.Items[^1].CorrelationId);
    }

    [Fact]
    public async Task GeneratePdf_ReturnsPdfSignatureAndSupportsCancellation()
    {
        var occurred = DateTimeOffset.UtcNow;
        await AddAsync("AuctionClosed", occurred, 16, "closed");
        var report = await reports.BuildAsync(new ActivityReportRequest(occurred.AddMinutes(-1), occurred.AddMinutes(1), AuctionId, null), CancellationToken.None);

        var pdf = await reports.GeneratePdfAsync(report, CancellationToken.None);

        Assert.True(pdf.Length > 4);
        Assert.Equal("%PDF", System.Text.Encoding.ASCII.GetString(pdf, 0, 4));
        await Assert.ThrowsAsync<OperationCanceledException>(() => reports.GeneratePdfAsync(report, new CancellationToken(canceled: true)));
    }

    [Fact]
    public async Task Build_RejectsMoreThanMaximumRows()
    {
        var occurred = DateTimeOffset.UtcNow;
        var activities = Enumerable.Range(0, ActivityReportService.MaximumRows + 1)
            .Select(index => new AuctionActivity
            {
                EventId = Guid.NewGuid(),
                EventType = "BidAccepted",
                AggregateType = "Auction",
                AggregateId = AuctionId,
                AggregateVersion = index,
                CorrelationId = $"row-{index}",
                OccurredAtUtc = occurred,
                ProcessedAtUtc = occurred,
                Amount = 1250m
            });
        db.AuctionActivities.AddRange(activities);
        await db.SaveChangesAsync();

        var exception = await Assert.ThrowsAsync<ActivityReportValidationException>(() => reports.BuildAsync(new ActivityReportRequest(occurred.AddMinutes(-1), occurred.AddMinutes(1), AuctionId, null), CancellationToken.None));

        Assert.Contains("5,000", exception.Message, StringComparison.Ordinal);
    }

    private async Task AddAsync(string eventType, DateTimeOffset occurredAt, long version, string correlationId, Guid? aggregateId = null)
    {
        db.AuctionActivities.Add(new AuctionActivity
        {
            EventId = Guid.NewGuid(),
            EventType = eventType,
            AggregateType = "Auction",
            AggregateId = aggregateId ?? AuctionId,
            AggregateVersion = version,
            CorrelationId = correlationId,
            OccurredAtUtc = occurredAt,
            ProcessedAtUtc = occurredAt,
            Amount = 1250m
        });
        await db.SaveChangesAsync();
    }
}
