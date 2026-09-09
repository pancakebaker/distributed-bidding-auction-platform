namespace AuctionOperationsPortal.Data;

public sealed class AuctionActivity
{
    public long Id { get; set; }
    public Guid EventId { get; set; }
    public required string EventType { get; set; }
    public required string AggregateType { get; set; }
    public Guid AggregateId { get; set; }
    public long AggregateVersion { get; set; }
    public string? CorrelationId { get; set; }
    public DateTimeOffset OccurredAtUtc { get; set; }
    public DateTimeOffset ProcessedAtUtc { get; set; }
    public Guid? BidId { get; set; }
    public string? BidderId { get; set; }
    public decimal? Amount { get; set; }
    public string? WinnerId { get; set; }
    public string? SafeMetadataJson { get; set; }
}
