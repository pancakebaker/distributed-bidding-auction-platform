using AuctionOperationsPortal.Data;
using AuctionOperationsPortal.Notifications;
using Microsoft.EntityFrameworkCore;

namespace AuctionOperationsPortal.Persistence;

public interface IRecentActivityQuery
{
    Task<IReadOnlyList<ActivityNotification>> GetRecentAsync(int limit, CancellationToken cancellationToken);
}

public sealed class RecentActivityQuery(AuctionOperationsDbContext db) : IRecentActivityQuery
{
    public async Task<IReadOnlyList<ActivityNotification>> GetRecentAsync(int limit, CancellationToken cancellationToken)
    {
        var boundedLimit = Math.Clamp(limit, 1, 100);
        return await db.AuctionActivities
            .AsNoTracking()
            .OrderByDescending(activity => activity.OccurredAtUtc)
            .ThenByDescending(activity => activity.Id)
            .Take(boundedLimit)
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
    }
}
