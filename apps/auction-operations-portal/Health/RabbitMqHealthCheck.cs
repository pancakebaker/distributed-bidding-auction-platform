// <copyright file="RabbitMqHealthCheck.cs" company="Distributed Bidding Auction Platform">
// Copyright (c) Distributed Bidding Auction Platform. Licensed under the MIT license.
// </copyright>
using AuctionOperationsPortal.Options;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Options;
using RabbitMQ.Client;

namespace AuctionOperationsPortal.Health;

/// <summary>Checks reachability of the activity RabbitMQ broker.</summary>
public sealed class RabbitMqHealthCheck(IOptions<RabbitMqOptions> options) : IHealthCheck
{
    /// <summary>Runs a bounded broker connectivity check.</summary>
    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        var config = options.Value;
        try
        {
            var factory = new ConnectionFactory
            {
                HostName = config.HostName,
                Port = config.Port,
                UserName = config.UserName,
                Password = config.Password,
                VirtualHost = config.VirtualHost,
                RequestedConnectionTimeout = TimeSpan.FromSeconds(3)
            };
            await using var connection = await factory.CreateConnectionAsync(cancellationToken);
            return connection.IsOpen ? HealthCheckResult.Healthy() : HealthCheckResult.Unhealthy("RabbitMQ connection is closed.");
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception)
        {
            return HealthCheckResult.Unhealthy("RabbitMQ is unavailable.", exception);
        }
    }
}
