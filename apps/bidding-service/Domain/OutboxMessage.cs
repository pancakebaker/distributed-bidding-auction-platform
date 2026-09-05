namespace bidding_service.Domain;

public sealed class OutboxMessage
{
    public Guid Id { get; set; }
    public required string EventType { get; set; }
    public required string AggregateType { get; set; }
    public Guid AggregateId { get; set; }
    public long AggregateVersion { get; set; }
    public DateTimeOffset OccurredAtUtc { get; set; }
    public string? CorrelationId { get; set; }
    public required string Payload { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; }
    public DateTimeOffset? PublishedAtUtc { get; set; }
    public int PublishAttempts { get; set; }
    public string? LastError { get; set; }
}
