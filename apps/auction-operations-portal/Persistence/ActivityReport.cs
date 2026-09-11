// <copyright file="ActivityReport.cs" company="Distributed Bidding Auction Platform">
// Copyright (c) Distributed Bidding Auction Platform. Licensed under the MIT license.
// </copyright>
using AuctionOperationsPortal.Notifications;

namespace AuctionOperationsPortal.Persistence;

/// <summary>Defines the filters used to produce an activity report.</summary>
public sealed record ActivityReportRequest(
    DateTimeOffset? FromUtc,
    DateTimeOffset? ToUtc,
    Guid? AggregateId,
    string? EventType)
{
    /// <summary>Returns validation errors for the requested report range and filters.</summary>
    public IReadOnlyList<string> Validate() => new ActivityHistoryQuery(FromUtc, ToUtc, AggregateId, EventType).Validate();
}

/// <summary>Contains grouped counts and the total number of report rows.</summary>
public sealed record ActivityReportSummary(IReadOnlyDictionary<string, int> Counts, int TotalCount);

/// <summary>Contains the validated request, summary, and activity rows for a report.</summary>
public sealed record ActivityReport(
    ActivityReportRequest Request,
    DateTimeOffset GeneratedAtUtc,
    ActivityReportSummary Summary,
    IReadOnlyList<ActivityNotification> Items);

/// <summary>Indicates that a requested report cannot be generated from its filters.</summary>
public sealed class ActivityReportValidationException(IReadOnlyList<string> errors) : Exception(string.Join(" ", errors))
{
    /// <summary>Gets the validation messages that explain why the report was rejected.</summary>
    public IReadOnlyList<string> Errors { get; } = errors;
}
