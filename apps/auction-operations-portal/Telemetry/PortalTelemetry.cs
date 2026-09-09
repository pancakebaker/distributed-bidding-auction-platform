using System.Diagnostics;
using System.Diagnostics.Metrics;

namespace AuctionOperationsPortal.Telemetry;

public static class PortalTelemetry
{
    public const string ActivitySourceName = "AuctionOperationsPortal";
    public const string MeterName = "AuctionOperationsPortal";

    public static readonly ActivitySource ActivitySource = new(ActivitySourceName);
    public static readonly Meter Meter = new(MeterName);
    public static readonly Counter<long> EventsProcessed = Meter.CreateCounter<long>("portal.events.processed", "events");
    public static readonly Counter<long> EventsDuplicate = Meter.CreateCounter<long>("portal.events.duplicate", "events");
    public static readonly Counter<long> EventsRejected = Meter.CreateCounter<long>("portal.events.rejected", "events");
    public static readonly Counter<long> EventsTransientFailures = Meter.CreateCounter<long>("portal.events.transient_failures", "events");
    public static readonly Counter<long> SignalRPublications = Meter.CreateCounter<long>("portal.signalr.publications", "notifications");
    public static readonly Counter<long> SignalRPublishFailures = Meter.CreateCounter<long>("portal.signalr.publish_failures", "failures");
    public static readonly Counter<long> ReportsGenerated = Meter.CreateCounter<long>("portal.reports.generated", "reports");
    public static readonly Counter<long> ReportsRejected = Meter.CreateCounter<long>("portal.reports.rejected", "reports");
    public static readonly Histogram<double> EventProcessingDuration = Meter.CreateHistogram<double>("portal.event.processing.duration", "ms");
    public static readonly Histogram<double> HistoryQueryDuration = Meter.CreateHistogram<double>("portal.history.query.duration", "ms");
    public static readonly Histogram<double> ReportGenerationDuration = Meter.CreateHistogram<double>("portal.report.generation.duration", "ms");
    public static readonly Histogram<long> ReportRowCount = Meter.CreateHistogram<long>("portal.report.row_count", "rows");

    public static Activity? StartActivity(string name, ActivityKind kind = ActivityKind.Internal) => ActivitySource.StartActivity(name, kind);

    public static void AddEventTags(Activity? activity, Guid eventId, string eventType, Guid aggregateId, long aggregateVersion, string? correlationId)
    {
        activity?.SetTag("event.id", eventId.ToString());
        activity?.SetTag("event.type", eventType);
        activity?.SetTag("aggregate.id", aggregateId.ToString());
        activity?.SetTag("aggregate.version", aggregateVersion);
        activity?.SetTag("correlation.id", correlationId);
    }
}
