namespace outbox_publisher.Options;

public sealed class ConnectionStringsOptions
{
    public const string SectionName = "ConnectionStrings";
    public string BiddingDb { get; set; } = string.Empty;
}
