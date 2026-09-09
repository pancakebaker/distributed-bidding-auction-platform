using AuctionOperationsPortal.Data;
using AuctionOperationsPortal.Notifications;
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
        var errors = request.Validate();
        if (errors.Count > 0)
            throw new ActivityReportValidationException(errors);

        var activities = ApplyFilters(request);
        var totalCount = await activities.CountAsync(cancellationToken);
        if (totalCount > MaximumRows)
            throw new ActivityReportValidationException([$"The report cannot contain more than {MaximumRows:N0} activity rows."]);

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
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(ActivityReportPdfRenderer.Render(report, cancellationToken));
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
