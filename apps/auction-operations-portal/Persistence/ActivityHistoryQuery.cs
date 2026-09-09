using System.Globalization;

namespace AuctionOperationsPortal.Persistence;

public sealed record ActivityHistoryQuery(
    DateTimeOffset? FromUtc,
    DateTimeOffset? ToUtc,
    Guid? AggregateId,
    string? EventType,
    int Page = 1,
    int PageSize = ActivityHistoryQueryRules.DefaultPageSize)
{
    public IReadOnlyList<string> Validate()
    {
        var errors = new List<string>();
        if (FromUtc is null)
            errors.Add("From is required.");
        if (ToUtc is null)
            errors.Add("To is required.");
        if (FromUtc is not null && ToUtc is not null)
        {
            var fromUtc = FromUtc.Value.ToUniversalTime();
            var toUtc = ToUtc.Value.ToUniversalTime();
            if (fromUtc > toUtc)
                errors.Add("From must be earlier than or equal to To.");
            if (toUtc - fromUtc > ActivityHistoryQueryRules.MaximumRange)
                errors.Add("The maximum historical range is 31 days.");
        }

        if (EventType is not null && !ActivityHistoryQueryRules.KnownEventTypes.Contains(EventType))
            errors.Add("Event Type must be BidAccepted, AuctionClosed, or WinnerSelected.");
        if (Page < 1)
            errors.Add("Page must be at least 1.");
        if (!ActivityHistoryQueryRules.AllowedPageSizes.Contains(PageSize))
            errors.Add("Page size must be 25, 50, or 100.");

        return errors;
    }
}

public static class ActivityHistoryQueryRules
{
    public const int DefaultPageSize = 25;
    public const int MaximumPageSize = 100;
    public static readonly TimeSpan MaximumRange = TimeSpan.FromDays(31);
    public static readonly IReadOnlySet<string> KnownEventTypes = new HashSet<string>(StringComparer.Ordinal)
    {
        "BidAccepted",
        "AuctionClosed",
        "WinnerSelected"
    };
    public static readonly IReadOnlySet<int> AllowedPageSizes = new HashSet<int> { 25, 50, MaximumPageSize };
}

public sealed record ActivityHistoryQueryParseResult(ActivityHistoryQuery? Query, IReadOnlyList<string> Errors)
{
    public bool IsValid => Query is not null && Errors.Count == 0;
}

public static class ActivityHistoryQueryParser
{
    public static ActivityHistoryQueryParseResult Parse(
        string? from,
        string? to,
        string? aggregateId,
        string? eventType,
        string? page,
        string? pageSize)
    {
        var errors = new List<string>();
        var fromUtc = ParseTimestamp(from, "From", errors);
        var toUtc = ParseTimestamp(to, "To", errors);
        Guid? parsedAggregateId = null;
        if (!string.IsNullOrWhiteSpace(aggregateId) && !Guid.TryParse(aggregateId, out var aggregateIdValue))
            errors.Add("Auction/Aggregate ID must be a valid GUID.");
        else if (!string.IsNullOrWhiteSpace(aggregateId))
            parsedAggregateId = Guid.Parse(aggregateId!);

        var parsedPage = ParseInteger(page, 1, "Page", errors);
        var parsedPageSize = ParseInteger(pageSize, ActivityHistoryQueryRules.DefaultPageSize, "Page size", errors);
        var query = new ActivityHistoryQuery(fromUtc, toUtc, string.IsNullOrWhiteSpace(aggregateId) ? null : parsedAggregateId, string.IsNullOrWhiteSpace(eventType) ? null : eventType, parsedPage, parsedPageSize);
        errors.AddRange(query.Validate());
        return new ActivityHistoryQueryParseResult(query, errors.Distinct(StringComparer.Ordinal).ToArray());
    }

    private static DateTimeOffset? ParseTimestamp(string? value, string name, List<string> errors)
    {
        if (string.IsNullOrWhiteSpace(value))
            return null;
        if (!DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var parsed))
        {
            errors.Add($"{name} must be a valid UTC timestamp.");
            return null;
        }

        return parsed.ToUniversalTime();
    }

    private static int ParseInteger(string? value, int defaultValue, string name, List<string> errors)
    {
        if (string.IsNullOrWhiteSpace(value))
            return defaultValue;
        if (!int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed))
        {
            errors.Add($"{name} must be a whole number.");
            return defaultValue;
        }

        return parsed;
    }
}
