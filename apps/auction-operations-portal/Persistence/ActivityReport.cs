using AuctionOperationsPortal.Notifications;

namespace AuctionOperationsPortal.Persistence;

public sealed record ActivityReportRequest(
    DateTimeOffset? FromUtc,
    DateTimeOffset? ToUtc,
    Guid? AggregateId,
    string? EventType)
{
    public IReadOnlyList<string> Validate() => new ActivityHistoryQuery(FromUtc, ToUtc, AggregateId, EventType).Validate();
}

public sealed record ActivityReportSummary(IReadOnlyDictionary<string, int> Counts, int TotalCount);

public sealed record ActivityReport(
    ActivityReportRequest Request,
    DateTimeOffset GeneratedAtUtc,
    ActivityReportSummary Summary,
    IReadOnlyList<ActivityNotification> Items);

public sealed class ActivityReportValidationException(IReadOnlyList<string> errors) : Exception(string.Join(" ", errors))
{
    public IReadOnlyList<string> Errors { get; } = errors;
}
