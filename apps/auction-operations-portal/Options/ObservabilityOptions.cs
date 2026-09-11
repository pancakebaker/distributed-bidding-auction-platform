// <copyright file="ObservabilityOptions.cs" company="Distributed Bidding Auction Platform">
// Copyright (c) Distributed Bidding Auction Platform. Licensed under the MIT license.
// </copyright>
namespace AuctionOperationsPortal.Options;

/// <summary>Configures optional portal tracing and metrics exporters.</summary>
public sealed class ObservabilityOptions
{
    /// <summary>Gets the configuration section name.</summary>
    public const string SectionName = "Observability";
    /// <summary>Gets or sets whether telemetry is enabled.</summary>
    public bool Enabled { get; set; }
    /// <summary>Gets or sets whether console export is enabled.</summary>
    public bool UseConsoleExporter { get; set; }
    /// <summary>Gets or sets the telemetry service name.</summary>
    public string ServiceName { get; set; } = "auction-operations-portal";
    /// <summary>Gets or sets the telemetry service version.</summary>
    public string ServiceVersion { get; set; } = "1.0.0";
    /// <summary>Gets or sets the optional OTLP endpoint.</summary>
    public string? OtlpEndpoint { get; set; }
}
