// <copyright file="ActivityReportPdfRenderer.cs" company="Distributed Bidding Auction Platform">
// Copyright (c) Distributed Bidding Auction Platform. Licensed under the MIT license.
// </copyright>
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace AuctionOperationsPortal.Persistence;

/// <summary>Renders validated activity reports in the portal's PDF layout.</summary>
internal static class ActivityReportPdfRenderer
{
    static ActivityReportPdfRenderer() => QuestPDF.Settings.License = LicenseType.Community;

    /// <summary>Renders an activity report as a PDF document.</summary>
    public static byte[] Render(ActivityReport report, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        using var stream = new MemoryStream();
        Document.Create(document => document.Page(page =>
        {
            page.Size(PageSizes.A4);
            page.Margin(32);
            page.Header().Text("Auction Operations Activity Report").FontSize(18).Bold();
            page.Footer().AlignCenter().Text(text => text.CurrentPageNumber());
            page.Content().Column(column =>
            {
                column.Spacing(6);
                column.Item().Text($"Generated: {report.GeneratedAtUtc:yyyy-MM-dd HH:mm:ss} UTC");
                column.Item().Text(
                    $"Reporting period: {report.Request.FromUtc!.Value:yyyy-MM-dd HH:mm:ss} UTC "
                    + $"to {report.Request.ToUtc!.Value:yyyy-MM-dd HH:mm:ss} UTC");
                column.Item().Text($"Auction: {report.Request.AggregateId?.ToString() ?? "All"}");
                column.Item().Text($"Event type: {report.Request.EventType ?? "All"}");
                column.Item().PaddingTop(8).Text("Summary").Bold();
                foreach (var eventType in ActivityHistoryQueryRules.KnownEventTypes)
                    column.Item().Text($"{eventType}: {report.Summary.Counts[eventType]}");
                column.Item().Text($"Total: {report.Summary.TotalCount}").Bold();
                column.Item().PaddingTop(8).Text("Activity").Bold();
                column.Item().Table(table =>
                {
                    table.ColumnsDefinition(columns =>
                    {
                        columns.RelativeColumn(1.5f);
                        columns.RelativeColumn(1.1f);
                        columns.RelativeColumn(1.3f);
                        columns.RelativeColumn(.8f);
                        columns.RelativeColumn(.5f);
                        columns.RelativeColumn(1.2f);
                    });
                    table.Header(header =>
                    {
                        header.Cell().Text("Occurred UTC").Bold();
                        header.Cell().Text("Event").Bold();
                        header.Cell().Text("Auction").Bold();
                        header.Cell().Text("Amount").Bold();
                        header.Cell().Text("Version").Bold();
                        header.Cell().Text("Correlation ID").Bold();
                    });
                    foreach (var item in report.Items)
                    {
                        cancellationToken.ThrowIfCancellationRequested();
                        table.Cell().Text($"{item.OccurredAtUtc:yyyy-MM-dd HH:mm:ss}");
                        table.Cell().Text(item.EventType);
                        table.Cell().Text(item.AggregateId.ToString());
                        table.Cell().Text(
                            item.Amount?.ToString(
                                "0.00",
                                System.Globalization.CultureInfo.InvariantCulture)
                            ?? "—");
                        table.Cell().Text($"v{item.AggregateVersion}");
                        table.Cell().Text(item.CorrelationId ?? "—");
                    }
                });
            });
        })).GeneratePdf(stream);
        return stream.ToArray();
    }
}
