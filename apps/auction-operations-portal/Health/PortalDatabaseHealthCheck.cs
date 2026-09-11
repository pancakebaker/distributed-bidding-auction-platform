// <copyright file="PortalDatabaseHealthCheck.cs" company="Distributed Bidding Auction Platform">
// Copyright (c) Distributed Bidding Auction Platform. Licensed under the MIT license.
// </copyright>
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Npgsql;

namespace AuctionOperationsPortal.Health;

/// <summary>Checks reachability of the portal PostgreSQL database.</summary>
public sealed class PortalDatabaseHealthCheck(IConfiguration configuration) : IHealthCheck
{
    /// <summary>Runs a bounded database connectivity check.</summary>
    public async Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken cancellationToken = default)
    {
        var connectionString = configuration.GetConnectionString("AuctionOperationsDb");
        if (string.IsNullOrWhiteSpace(connectionString))
            return HealthCheckResult.Unhealthy("Database connection is not configured.");

        try
        {
            var builder = new NpgsqlConnectionStringBuilder(connectionString)
            {
                Timeout = 3,
                CommandTimeout = 3
            };
            await using var connection = new NpgsqlConnection(builder.ConnectionString);
            await connection.OpenAsync(cancellationToken);
            return HealthCheckResult.Healthy();
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception)
        {
            return HealthCheckResult.Unhealthy("Database is unavailable.", exception);
        }
    }
}
