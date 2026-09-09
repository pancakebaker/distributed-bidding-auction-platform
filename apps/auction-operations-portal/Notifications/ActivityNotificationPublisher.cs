using AuctionOperationsPortal.Hubs;
using AuctionOperationsPortal.Telemetry;
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
        using var span = PortalTelemetry.StartActivity("portal.signalr.publish");
        PortalTelemetry.AddEventTags(span, notification.EventId, notification.EventType, notification.AggregateId, notification.AggregateVersion, notification.CorrelationId);
        try
        {
            await hubContext.Clients.All.SendAsync("activityReceived", notification, cancellationToken);
            PortalTelemetry.SignalRPublications.Add(1);
            logger.LogDebug("Published activity notification {EventId} for {EventType} with correlation {CorrelationId}.", notification.EventId, notification.EventType, notification.CorrelationId);
        }
        catch
        {
            PortalTelemetry.SignalRPublishFailures.Add(1);
            throw;
        }
    }
}
