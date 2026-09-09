namespace AuctionOperationsPortal.Options;

public sealed class ObservabilityOptions
{
    public const string SectionName = "Observability";
    public bool Enabled { get; set; }
    public bool UseConsoleExporter { get; set; }
    public string ServiceName { get; set; } = "auction-operations-portal";
    public string ServiceVersion { get; set; } = "1.0.0";
    public string? OtlpEndpoint { get; set; }
}
