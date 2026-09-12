using AuctionOperationsPortal.Options;
using Microsoft.Extensions.Configuration;

namespace AuctionOperationsPortal.Tests;

public sealed class RabbitMqConfigurationTests
{
    [Fact]
    public void ServiceEnvironmentOverridesStandardRabbitMqSection()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["RabbitMq:Queue"] = "generic.queue",
                ["RabbitMq:Port"] = "5674",
                ["RabbitMq:UserName"] = "generic-user",
                ["RabbitMq:DeadLetterQueue"] = "generic.dlq",
                ["AUCTION_OPERATIONS_RABBITMQ_QUEUE"] = "service.queue",
                ["AUCTION_OPERATIONS_RABBITMQ_DLQ"] = "service.dlq",
                ["AUCTION_OPERATIONS_RABBITMQ_DLX"] = "service.dlx",
                ["AUCTION_OPERATIONS_RABBITMQ_PORT"] = "not-a-number",
                ["AUCTION_OPERATIONS_RABBITMQ_USERNAME"] = string.Empty
            })
            .Build();
        var options = configuration.GetSection(RabbitMqOptions.SectionName)
            .Get<RabbitMqOptions>() ?? new();

        RabbitMqOptions.ApplyEnvironmentOverrides(options, configuration);

        Assert.Equal("service.queue", options.Queue);
        Assert.Equal("service.dlq", options.DeadLetterQueue);
        Assert.Equal("service.dlx", options.DeadLetterExchange);
        Assert.Equal(5674, options.Port);
        Assert.Equal("generic-user", options.UserName);
    }
}