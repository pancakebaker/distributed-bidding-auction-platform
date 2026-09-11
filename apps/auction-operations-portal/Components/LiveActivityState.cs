// <copyright file="LiveActivityState.cs" company="Distributed Bidding Auction Platform">
// Copyright (c) Distributed Bidding Auction Platform. Licensed under the MIT license.
// </copyright>
using AuctionOperationsPortal.Notifications;

namespace AuctionOperationsPortal.Components;

/// <summary>Maintains a bounded, deduplicated live activity view for portal components.</summary>
public sealed class LiveActivityState(int limit = 100)
{
    private readonly Dictionary<Guid, ActivityNotification> byEventId = new();

    /// <summary>Gets the newest retained activity notifications.</summary>
    public IReadOnlyList<ActivityNotification> Items => byEventId.Values
        .OrderByDescending(activity => activity.OccurredAtUtc)
        .ThenByDescending(activity => activity.Id)
        .Take(limit)
        .ToArray();

    /// <summary>Merges incoming notifications and removes entries beyond the configured limit.</summary>
    public void Merge(IEnumerable<ActivityNotification> activities)
    {
        foreach (var activity in activities)
            byEventId[activity.EventId] = activity;

        var retained = byEventId.Values
            .OrderByDescending(activity => activity.OccurredAtUtc)
            .ThenByDescending(activity => activity.Id)
            .Take(limit)
            .Select(activity => activity.EventId)
            .ToHashSet();

        foreach (var eventId in byEventId.Keys.Where(eventId => !retained.Contains(eventId)).ToArray())
            byEventId.Remove(eventId);
    }
}
