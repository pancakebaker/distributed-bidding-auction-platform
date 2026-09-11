// <copyright file="RecentActivityQuery.cs" company="Distributed Bidding Auction Platform">
// Copyright (c) Distributed Bidding Auction Platform. Licensed under the MIT license.
// </copyright>
using AuctionOperationsPortal.Data;
using AuctionOperationsPortal.Notifications;
using Microsoft.EntityFrameworkCore;

namespace AuctionOperationsPortal.Persistence;

/// <summary>Reads the most recent persisted activity notifications.</summary>
public interface IRecentActivityQuery
{
    /// <summary>Returns a bounded newest-first activity list.</summary>
    Task<IReadOnlyList<ActivityNotification>> GetRecentAsync(int limit, CancellationToken cancellationToken);
}

/// <summary>Queries recent activity from the durable projection.</summary>
public sealed class RecentActivityQuery(AuctionOperationsDbContext db) : IRecentActivityQuery
{
    /// <summary>Loads the newest persisted activities within the requested bound.</summary>
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
