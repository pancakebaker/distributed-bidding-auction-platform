namespace outbox_publisher.Options;

public sealed class RabbitMqOptions
{
    public const string SectionName = "RabbitMq";
    public string HostName { get; set; } = "localhost";
    public int Port { get; set; } = 5672;
    public string UserName { get; set; } = "auction";
    public string Password { get; set; } = "change_me_in_local_env";
    public string VirtualHost { get; set; } = "/";
    public string Exchange { get; set; } = "auction.events";
    public string DebugQueue { get; set; } = "auction.events.debug";
    public bool DeclareDebugQueue { get; set; } = true;
}
