using System.Diagnostics;
using AuctionOperationsPortal.Data;
using AuctionOperationsPortal.Notifications;
using AuctionOperationsPortal.Telemetry;
using Microsoft.EntityFrameworkCore;

namespace AuctionOperationsPortal.Persistence;

public interface IActivityReportService
{
    Task<ActivityReport> BuildAsync(ActivityReportRequest request, CancellationToken cancellationToken);
    Task<byte[]> GeneratePdfAsync(ActivityReport report, CancellationToken cancellationToken);
}

public sealed class ActivityReportService(AuctionOperationsDbContext db) : IActivityReportService
{
    public const int MaximumRows = 5_000;

    public async Task<ActivityReport> BuildAsync(ActivityReportRequest request, CancellationToken cancellationToken)
    {
        using var activity = PortalTelemetry.StartActivity("portal.report.query");
        activity?.SetTag("report.has_aggregate_filter", request.AggregateId is not null);
        activity?.SetTag("report.event_type", request.EventType);
        var errors = request.Validate();
        if (errors.Count > 0)
        {
            PortalTelemetry.ReportsRejected.Add(1, new KeyValuePair<string, object?>("reason", "validation"));
            throw new ActivityReportValidationException(errors);
        }

        var activities = ApplyFilters(request);
        var totalCount = await activities.CountAsync(cancellationToken);
        activity?.SetTag("report.row_count", totalCount);
        PortalTelemetry.ReportRowCount.Record(totalCount);
        if (totalCount > MaximumRows)
        {
            PortalTelemetry.ReportsRejected.Add(1, new KeyValuePair<string, object?>("reason", "row_limit"));
            throw new ActivityReportValidationException([$"The report cannot contain more than {MaximumRows:N0} activity rows."]);
        }

        var groupedCounts = await activities
            .GroupBy(activity => activity.EventType)
            .Select(group => new { EventType = group.Key, Count = group.Count() })
            .ToListAsync(cancellationToken);
        var counts = ActivityHistoryQueryRules.KnownEventTypes.ToDictionary(
            eventType => eventType,
            eventType => groupedCounts.FirstOrDefault(group => group.EventType == eventType)?.Count ?? 0,
            StringComparer.Ordinal);
        var items = await activities
            .OrderBy(activity => activity.OccurredAtUtc)
            .ThenBy(activity => activity.Id)
            .Select(activity => new ActivityNotification(
                activity.Id,
                activity.EventId,
                activity.EventType,
                activity.AggregateId,
                activity.AggregateVersion,
                activity.CorrelationId,
                activity.OccurredAtUtc,
                activity.ProcessedAtUtc,
                activity.BidderId,
                activity.Amount,
                activity.WinnerId))
            .ToListAsync(cancellationToken);

        return new ActivityReport(request, DateTimeOffset.UtcNow, new ActivityReportSummary(counts, totalCount), items);
    }

    public Task<byte[]> GeneratePdfAsync(ActivityReport report, CancellationToken cancellationToken)
    {
        var started = Stopwatch.GetTimestamp();
        using var activity = PortalTelemetry.StartActivity("portal.report.render");
        activity?.SetTag("report.row_count", report.Items.Count);
        try
        {
            cancellationToken.ThrowIfCancellationRequested();
            var pdf = ActivityReportPdfRenderer.Render(report, cancellationToken);
            PortalTelemetry.ReportsGenerated.Add(1);
            return Task.FromResult(pdf);
        }
        finally
        {
            PortalTelemetry.ReportGenerationDuration.Record(Stopwatch.GetElapsedTime(started).TotalMilliseconds);
        }
    }

    private IQueryable<AuctionActivity> ApplyFilters(ActivityReportRequest request)
    {
        var fromUtc = request.FromUtc!.Value.ToUniversalTime();
        var toUtc = request.ToUtc!.Value.ToUniversalTime();
        var activities = db.AuctionActivities
            .AsNoTracking()
            .Where(activity => activity.OccurredAtUtc >= fromUtc && activity.OccurredAtUtc <= toUtc);
        if (request.AggregateId is not null)
            activities = activities.Where(activity => activity.AggregateId == request.AggregateId.Value);
        if (request.EventType is not null)
            activities = activities.Where(activity => activity.EventType == request.EventType);
        return activities;
    }
}
