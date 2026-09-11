// <copyright file="ActivityNotificationPublisher.cs" company="Distributed Bidding Auction Platform">
// Copyright (c) Distributed Bidding Auction Platform. Licensed under the MIT license.
// </copyright>
using AuctionOperationsPortal.Hubs;
using AuctionOperationsPortal.Telemetry;
using Microsoft.AspNetCore.SignalR;

namespace AuctionOperationsPortal.Notifications;

/// <summary>Publishes persisted activities to connected portal clients.</summary>
public interface IActivityNotificationPublisher
{
    /// <summary>Publishes one safe activity notification.</summary>
    Task PublishAsync(Data.AuctionActivity activity, CancellationToken cancellationToken);
}

/// <summary>Publishes activity notifications through the portal SignalR hub.</summary>
public sealed class SignalRActivityNotificationPublisher(
    IHubContext<ActivityHub> hubContext,
    ILogger<SignalRActivityNotificationPublisher> logger) : IActivityNotificationPublisher
{
    /// <summary>Publishes an activity to the authenticated portal room.</summary>
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
