namespace auction_scheduler.Options;

public sealed class ConnectionStringsOptions
{
    public const string SectionName = "ConnectionStrings";

    public string BiddingDb { get; init; } = string.Empty;
}
