// <copyright file="RabbitMqOptions.cs" company="Distributed Bidding Auction Platform">
// Copyright (c) Distributed Bidding Auction Platform. Licensed under the MIT license.
// </copyright>
namespace AuctionOperationsPortal.Options;

/// <summary>Configures the auction activity RabbitMQ connection and topology.</summary>
public sealed class RabbitMqOptions
{
    /// <summary>Gets the configuration section name.</summary>
    public const string SectionName = "RabbitMq";
    /// <summary>Gets or sets the broker host name.</summary>
    public string HostName { get; set; } = "localhost";
    /// <summary>Gets or sets the broker port.</summary>
    public int Port { get; set; } = 5672;
    /// <summary>Gets or sets the broker username.</summary>
    public string UserName { get; set; } = "auction";
    /// <summary>Gets or sets the broker password.</summary>
    public string Password { get; set; } = "change_me_in_local_env";
    /// <summary>Gets or sets the broker virtual host.</summary>
    public string VirtualHost { get; set; } = "/";
    /// <summary>Gets or sets the exchange name.</summary>
    public string Exchange { get; set; } = "auction.events";
    /// <summary>Gets or sets the consumer queue name.</summary>
    public string Queue { get; set; } = "auction-operations.activity";
    /// <summary>Gets or sets the dead-letter exchange name.</summary>
    public string DeadLetterExchange { get; set; } = "auction-operations.dead-letter";
    /// <summary>Gets or sets the dead-letter queue name.</summary>
    public string DeadLetterQueue { get; set; } = "auction-operations.activity.dlq";
    /// <summary>Gets or sets the consumer prefetch count.</summary>
    public ushort PrefetchCount { get; set; } = 10;
    /// <summary>Gets or sets the maximum transient requeue attempts.</summary>
    public int MaxRequeueAttempts { get; set; } = 3;
}
