using AuctionOperationsPortal.Hubs;
using Microsoft.AspNetCore.SignalR;

namespace AuctionOperationsPortal.Notifications;

public interface IActivityNotificationPublisher
{
    Task PublishAsync(Data.AuctionActivity activity, CancellationToken cancellationToken);
}

public sealed class SignalRActivityNotificationPublisher(
    IHubContext<ActivityHub> hubContext,
    ILogger<SignalRActivityNotificationPublisher> logger) : IActivityNotificationPublisher
{
    public async Task PublishAsync(Data.AuctionActivity activity, CancellationToken cancellationToken)
    {
        var notification = ActivityNotification.From(activity);
        await hubContext.Clients.All.SendAsync("activityReceived", notification, cancellationToken);
        logger.LogDebug("Published activity notification {EventId} for {EventType} with correlation {CorrelationId}.", notification.EventId, notification.EventType, notification.CorrelationId);
    }
}
