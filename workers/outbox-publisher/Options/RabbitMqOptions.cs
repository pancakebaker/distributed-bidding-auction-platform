// <copyright file="RabbitMqOptions.cs" company="Distributed Bidding Auction Platform">
// Copyright (c) Distributed Bidding Auction Platform. Licensed under the MIT license.
// </copyright>
namespace outbox_publisher.Options;

/// <summary>
/// Configures RabbitMQ connectivity and publisher topology.
/// </summary>
public sealed class RabbitMqOptions
{
    /// <summary>
    /// Identifies the configuration section name.
    /// </summary>
    public const string SectionName = "RabbitMq";
    /// <summary>
    /// Gets or sets the RabbitMQ host name.
    /// </summary>
    public string HostName { get; set; } = "localhost";
    /// <summary>
    /// Gets or sets the RabbitMQ port.
    /// </summary>
    public int Port { get; set; } = 5672;
    /// <summary>
    /// Gets or sets the RabbitMQ username.
    /// </summary>
    public string UserName { get; set; } = "auction";
    /// <summary>
    /// Gets or sets the RabbitMQ password.
    /// </summary>
    public string Password { get; set; } = "change_me_in_local_env";
    /// <summary>
    /// Gets or sets the RabbitMQ virtual host.
    /// </summary>
    public string VirtualHost { get; set; } = "/";
    /// <summary>
    /// Gets the RabbitMQ exchange used for auction events.
    /// </summary>
    public string Exchange { get; set; } = "auction.events";
    /// <summary>
    /// Gets or sets the development debug queue name.
    /// </summary>
    public string DebugQueue { get; set; } = "auction.events.debug";
    /// <summary>
    /// Gets or sets a value indicating whether the development debug queue is declared.
    /// </summary>
    public bool DeclareDebugQueue { get; set; } = true;
}
