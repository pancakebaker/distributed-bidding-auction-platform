using AuctionOperationsPortal.Notifications;

namespace AuctionOperationsPortal.Components;

public sealed class LiveActivityState(int limit = 100)
{
    private readonly Dictionary<Guid, ActivityNotification> byEventId = new();

    public IReadOnlyList<ActivityNotification> Items => byEventId.Values
        .OrderByDescending(activity => activity.OccurredAtUtc)
        .ThenByDescending(activity => activity.Id)
        .Take(limit)
        .ToArray();

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
