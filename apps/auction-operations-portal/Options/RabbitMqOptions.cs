// <copyright file="RabbitMqOptions.cs" company="Distributed Bidding Auction Platform">
// Copyright (c) Distributed Bidding Auction Platform. Licensed under the MIT license.
// </copyright>
using Microsoft.Extensions.Configuration;

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

    /// <summary>
    /// Applies Operations Portal-specific environment overrides after the standard RabbitMq
    /// section is bound.
    /// </summary>
    public static void ApplyEnvironmentOverrides(
        RabbitMqOptions options,
        IConfiguration configuration)
    {
        ApplyString(
            configuration,
            "AUCTION_OPERATIONS_RABBITMQ_HOST",
            value => options.HostName = value);
        ApplyInt(configuration, "AUCTION_OPERATIONS_RABBITMQ_PORT", value => options.Port = value);
        ApplyString(
            configuration,
            "AUCTION_OPERATIONS_RABBITMQ_USERNAME",
            value => options.UserName = value);
        ApplyString(
            configuration,
            "AUCTION_OPERATIONS_RABBITMQ_PASSWORD",
            value => options.Password = value);
        ApplyString(
            configuration,
            "AUCTION_OPERATIONS_RABBITMQ_VHOST",
            value => options.VirtualHost = value);
        ApplyString(
            configuration,
            "AUCTION_OPERATIONS_RABBITMQ_EXCHANGE",
            value => options.Exchange = value);
        ApplyString(
            configuration,
            "AUCTION_OPERATIONS_RABBITMQ_QUEUE",
            value => options.Queue = value);
        ApplyString(
            configuration,
            "AUCTION_OPERATIONS_RABBITMQ_DLX",
            value => options.DeadLetterExchange = value);
        ApplyString(
            configuration,
            "AUCTION_OPERATIONS_RABBITMQ_DLQ",
            value => options.DeadLetterQueue = value);
        ApplyUShort(
            configuration,
            "AUCTION_OPERATIONS_RABBITMQ_PREFETCH",
            value => options.PrefetchCount = value);
        ApplyInt(
            configuration,
            "AUCTION_OPERATIONS_RABBITMQ_MAX_REQUEUE_ATTEMPTS",
            value => options.MaxRequeueAttempts = value);
    }

    private static void ApplyString(
        IConfiguration configuration,
        string key,
        Action<string> setter)
    {
        var value = configuration[key];
        if (!string.IsNullOrWhiteSpace(value)) setter(value);
    }

    private static void ApplyInt(
        IConfiguration configuration,
        string key,
        Action<int> setter)
    {
        if (int.TryParse(configuration[key], out var value) && value > 0) setter(value);
    }

    private static void ApplyUShort(
        IConfiguration configuration,
        string key,
        Action<ushort> setter)
    {
        if (ushort.TryParse(configuration[key], out var value) && value > 0) setter(value);
    }
}
