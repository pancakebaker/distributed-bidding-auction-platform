// <copyright file="ActivityHub.cs" company="Distributed Bidding Auction Platform">
// Copyright (c) Distributed Bidding Auction Platform. Licensed under the MIT license.
// </copyright>
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace AuctionOperationsPortal.Hubs;

/// <summary>Provides the authenticated SignalR endpoint for live activity updates.</summary>
[Authorize(Policy = "AuctionOperationsAdmin")]
public sealed class ActivityHub(ILogger<ActivityHub> logger) : Hub
{
    /// <summary>Logs and completes a newly established hub connection.</summary>
    public override Task OnConnectedAsync()
    {
        logger.LogInformation(
            "Activity hub connection established {ConnectionId}.",
            Context.ConnectionId);
        return base.OnConnectedAsync();
    }

    /// <summary>Logs and completes a disconnected hub connection.</summary>
    public override Task OnDisconnectedAsync(Exception? exception)
    {
        if (exception is null)
        {
            logger.LogInformation(
                "Activity hub connection closed {ConnectionId}.",
                Context.ConnectionId);
        }
        else
        {
            logger.LogInformation(
                exception,
                "Activity hub connection closed unexpectedly {ConnectionId}.",
                Context.ConnectionId);
        }

        return base.OnDisconnectedAsync(exception);
    }
}
