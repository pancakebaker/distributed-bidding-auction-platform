using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace AuctionOperationsPortal.Hubs;

[Authorize(Policy = "AuctionOperationsAdmin")]
public sealed class ActivityHub(ILogger<ActivityHub> logger) : Hub
{
    public override Task OnConnectedAsync()
    {
        logger.LogInformation("Activity hub connection established {ConnectionId}.", Context.ConnectionId);
        return base.OnConnectedAsync();
    }

    public override Task OnDisconnectedAsync(Exception? exception)
    {
        if (exception is null)
            logger.LogInformation("Activity hub connection closed {ConnectionId}.", Context.ConnectionId);
        else
            logger.LogInformation(exception, "Activity hub connection closed unexpectedly {ConnectionId}.", Context.ConnectionId);

        return base.OnDisconnectedAsync(exception);
    }
}
