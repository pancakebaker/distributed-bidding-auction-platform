using AuctionOperationsPortal.Data;

namespace AuctionOperationsPortal.Notifications;

public sealed record ActivityNotification(
    long Id,
    Guid EventId,
    string EventType,
    Guid AggregateId,
    long AggregateVersion,
    string? CorrelationId,
    DateTimeOffset OccurredAtUtc,
    DateTimeOffset ProcessedAtUtc,
    string? BidderId,
    decimal? Amount,
    string? WinnerId)
{
    public static ActivityNotification From(AuctionActivity activity) => new(
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
        activity.WinnerId);
}
