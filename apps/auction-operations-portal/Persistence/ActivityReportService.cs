// <copyright file="ActivityReportService.cs" company="Distributed Bidding Auction Platform">
// Copyright (c) Distributed Bidding Auction Platform. Licensed under the MIT license.
// </copyright>
using System.Diagnostics;
using AuctionOperationsPortal.Data;
using AuctionOperationsPortal.Notifications;
using AuctionOperationsPortal.Telemetry;
using Microsoft.EntityFrameworkCore;

namespace AuctionOperationsPortal.Persistence;

/// <summary>Builds activity reports and renders them for download.</summary>
public interface IActivityReportService
{
    /// <summary>Queries and validates the activity rows for a report request.</summary>
    Task<ActivityReport> BuildAsync(ActivityReportRequest request, CancellationToken cancellationToken);
    /// <summary>Renders a previously built report as a PDF document.</summary>
    Task<byte[]> GeneratePdfAsync(ActivityReport report, CancellationToken cancellationToken);
}

/// <summary>Coordinates report validation, database queries, and PDF generation.</summary>
public sealed class ActivityReportService(AuctionOperationsDbContext db) : IActivityReportService
{
    /// <summary>Maximum number of activity rows allowed in a generated report.</summary>
    public const int MaximumRows = 5_000;

    /// <inheritdoc />
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

    /// <inheritdoc />
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
