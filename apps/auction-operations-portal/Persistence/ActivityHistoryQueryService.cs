using System.Diagnostics;
using AuctionOperationsPortal.Data;
using AuctionOperationsPortal.Notifications;
using AuctionOperationsPortal.Telemetry;
using Microsoft.EntityFrameworkCore;

namespace AuctionOperationsPortal.Persistence;

public sealed record ActivityHistoryPage(
    IReadOnlyList<ActivityNotification> Items,
    int Page,
    int PageSize,
    int TotalCount,
    int TotalPages);

public interface IActivityHistoryQueryService
{
    Task<ActivityHistoryPage> SearchAsync(ActivityHistoryQuery query, CancellationToken cancellationToken);
}

public sealed class ActivityHistoryQueryService(AuctionOperationsDbContext db) : IActivityHistoryQueryService
{
    public async Task<ActivityHistoryPage> SearchAsync(ActivityHistoryQuery query, CancellationToken cancellationToken)
    {
        var started = Stopwatch.GetTimestamp();
        using var activity = PortalTelemetry.StartActivity("portal.history.query");
        activity?.SetTag("history.page", query.Page);
        activity?.SetTag("history.page_size", query.PageSize);
        activity?.SetTag("history.has_aggregate_filter", query.AggregateId is not null);
        activity?.SetTag("history.event_type", query.EventType);
        var errors = query.Validate();
        try
        {
            if (errors.Count > 0)
                throw new ActivityHistoryQueryValidationException(errors);

            var fromUtc = query.FromUtc!.Value.ToUniversalTime();
            var toUtc = query.ToUtc!.Value.ToUniversalTime();
            var skip = (long)(query.Page - 1) * query.PageSize;
            var activities = db.AuctionActivities
                .AsNoTracking()
                .Where(activity => activity.OccurredAtUtc >= fromUtc && activity.OccurredAtUtc <= toUtc);
            if (query.AggregateId is not null)
                activities = activities.Where(activity => activity.AggregateId == query.AggregateId.Value);
            if (query.EventType is not null)
                activities = activities.Where(activity => activity.EventType == query.EventType);

            var totalCount = await activities.CountAsync(cancellationToken);
            var totalPages = totalCount == 0 ? 0 : (totalCount + query.PageSize - 1) / query.PageSize;
            var items = await activities
                .OrderByDescending(activity => activity.OccurredAtUtc)
                .ThenByDescending(activity => activity.Id)
                .Skip(skip > int.MaxValue ? int.MaxValue : (int)skip)
                .Take(query.PageSize)
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

            activity?.SetTag("history.result_count", items.Count);
            return new ActivityHistoryPage(items, query.Page, query.PageSize, totalCount, totalPages);
        }
        finally
        {
            PortalTelemetry.HistoryQueryDuration.Record(Stopwatch.GetElapsedTime(started).TotalMilliseconds);
        }
    }
}

public sealed class ActivityHistoryQueryValidationException(IReadOnlyList<string> errors) : Exception(string.Join(" ", errors))
{
    public IReadOnlyList<string> Errors { get; } = errors;
}
