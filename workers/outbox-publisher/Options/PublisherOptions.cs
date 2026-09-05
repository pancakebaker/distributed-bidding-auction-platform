namespace outbox_publisher.Options;

public sealed class PublisherOptions
{
    public const string SectionName = "Publisher";
    public int PollIntervalSeconds { get; set; } = 1;
    public int BatchSize { get; set; } = 20;
    public int MaxPublishAttempts { get; set; } = 10;
}
