// <copyright file="PortalTelemetry.cs" company="Distributed Bidding Auction Platform">
// Copyright (c) Distributed Bidding Auction Platform. Licensed under the MIT license.
// </copyright>
using System.Diagnostics;
using System.Diagnostics.Metrics;

namespace AuctionOperationsPortal.Telemetry;

/// <summary>Defines the portal's tracing source and operational metrics.</summary>
public static class PortalTelemetry
{
    /// <summary>Gets the name used for portal activities.</summary>
    public const string ActivitySourceName = "AuctionOperationsPortal";
    /// <summary>Gets the name used for portal metrics.</summary>
    public const string MeterName = "AuctionOperationsPortal";

    /// <summary>Provides the portal activity source.</summary>
    public static readonly ActivitySource ActivitySource = new(ActivitySourceName);
    /// <summary>Provides the portal meter.</summary>
    public static readonly Meter Meter = new(MeterName);
    /// <summary>Counts successfully processed events.</summary>
    public static readonly Counter<long> EventsProcessed = Meter.CreateCounter<long>("portal.events.processed", "events");
    /// <summary>Counts duplicate events ignored by idempotent processing.</summary>
    public static readonly Counter<long> EventsDuplicate = Meter.CreateCounter<long>("portal.events.duplicate", "events");
    /// <summary>Counts events rejected as invalid or unsupported.</summary>
    public static readonly Counter<long> EventsRejected = Meter.CreateCounter<long>("portal.events.rejected", "events");
    /// <summary>Counts transient event-processing failures.</summary>
    public static readonly Counter<long> EventsTransientFailures = Meter.CreateCounter<long>("portal.events.transient_failures", "events");
    /// <summary>Counts activity notifications published through SignalR.</summary>
    public static readonly Counter<long> SignalRPublications = Meter.CreateCounter<long>("portal.signalr.publications", "notifications");
    /// <summary>Counts failed SignalR activity publications.</summary>
    public static readonly Counter<long> SignalRPublishFailures = Meter.CreateCounter<long>("portal.signalr.publish_failures", "failures");
    /// <summary>Counts generated activity reports.</summary>
    public static readonly Counter<long> ReportsGenerated = Meter.CreateCounter<long>("portal.reports.generated", "reports");
    /// <summary>Counts rejected activity report requests.</summary>
    public static readonly Counter<long> ReportsRejected = Meter.CreateCounter<long>("portal.reports.rejected", "reports");
    /// <summary>Measures event-processing duration.</summary>
    public static readonly Histogram<double> EventProcessingDuration = Meter.CreateHistogram<double>("portal.event.processing.duration", "ms");
    /// <summary>Measures activity-history query duration.</summary>
    public static readonly Histogram<double> HistoryQueryDuration = Meter.CreateHistogram<double>("portal.history.query.duration", "ms");
    /// <summary>Measures PDF report-generation duration.</summary>
    public static readonly Histogram<double> ReportGenerationDuration = Meter.CreateHistogram<double>("portal.report.generation.duration", "ms");
    /// <summary>Records the number of rows returned by reports.</summary>
    public static readonly Histogram<long> ReportRowCount = Meter.CreateHistogram<long>("portal.report.row_count", "rows");

    /// <summary>Starts a portal activity span.</summary>
    public static Activity? StartActivity(string name, ActivityKind kind = ActivityKind.Internal) => ActivitySource.StartActivity(name, kind);

    /// <summary>Adds standard event dimensions to an activity span.</summary>
    public static void AddEventTags(Activity? activity, Guid eventId, string eventType, Guid aggregateId, long aggregateVersion, string? correlationId)
    {
        activity?.SetTag("event.id", eventId.ToString());
        activity?.SetTag("event.type", eventType);
        activity?.SetTag("aggregate.id", aggregateId.ToString());
        activity?.SetTag("aggregate.version", aggregateVersion);
        activity?.SetTag("correlation.id", correlationId);
    }
}
