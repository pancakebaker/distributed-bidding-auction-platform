namespace AuctionOperationsPortal.Options;

public sealed class RabbitMqOptions
{
    public const string SectionName = "RabbitMq";
    public string HostName { get; set; } = "localhost";
    public int Port { get; set; } = 5672;
    public string UserName { get; set; } = "auction";
    public string Password { get; set; } = "change_me_in_local_env";
    public string VirtualHost { get; set; } = "/";
    public string Exchange { get; set; } = "auction.events";
    public string Queue { get; set; } = "auction-operations.activity";
    public string DeadLetterExchange { get; set; } = "auction-operations.dead-letter";
    public string DeadLetterQueue { get; set; } = "auction-operations.activity.dlq";
    public ushort PrefetchCount { get; set; } = 10;
    public int MaxRequeueAttempts { get; set; } = 3;
}
