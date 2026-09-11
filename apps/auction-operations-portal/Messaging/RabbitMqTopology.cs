// <copyright file="RabbitMqTopology.cs" company="Distributed Bidding Auction Platform">
// Copyright (c) Distributed Bidding Auction Platform. Licensed under the MIT license.
// </copyright>
using AuctionOperationsPortal.Options;
using Microsoft.Extensions.Options;
using RabbitMQ.Client;

namespace AuctionOperationsPortal.Messaging;

/// <summary>Declares the RabbitMQ topology consumed by the operations portal.</summary>
public sealed class RabbitMqTopology(IOptions<RabbitMqOptions> options)
{
    private static readonly string[] RoutingKeys =
    [
        "auction.bid.accepted",
        "auction.closed",
        "auction.winner.selected"
    ];

    /// <summary>Declares exchanges, queues, and event bindings.</summary>
    public async Task DeclareAsync(IChannel channel, CancellationToken cancellationToken)
    {
        var config = options.Value;
        await channel.ExchangeDeclareAsync(
            config.Exchange,
            ExchangeType.Topic,
            durable: true,
            autoDelete: false,
            cancellationToken: cancellationToken);
        await channel.ExchangeDeclareAsync(
            config.DeadLetterExchange,
            ExchangeType.Fanout,
            durable: true,
            autoDelete: false,
            cancellationToken: cancellationToken);
        await channel.QueueDeclareAsync(
            config.DeadLetterQueue,
            durable: true,
            exclusive: false,
            autoDelete: false,
            cancellationToken: cancellationToken);
        await channel.QueueBindAsync(
            config.DeadLetterQueue,
            config.DeadLetterExchange,
            string.Empty,
            cancellationToken: cancellationToken);
        var arguments = new Dictionary<string, object?>
        {
            ["x-dead-letter-exchange"] = config.DeadLetterExchange
        };
        await channel.QueueDeclareAsync(
            config.Queue,
            durable: true,
            exclusive: false,
            autoDelete: false,
            arguments: arguments,
            cancellationToken: cancellationToken);
        foreach (var routingKey in RoutingKeys)
        {
            await channel.QueueBindAsync(
                config.Queue,
                config.Exchange,
                routingKey,
                cancellationToken: cancellationToken);
        }
    }
}
