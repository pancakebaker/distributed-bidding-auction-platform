// <copyright file="ActivityMessageHandler.cs" company="Distributed Bidding Auction Platform">
// Copyright (c) Distributed Bidding Auction Platform. Licensed under the MIT license.
// </copyright>
using System.Diagnostics;
using System.Text;
using System.Text.Json;
using AuctionOperationsPortal.Contracts;
using AuctionOperationsPortal.Notifications;
using AuctionOperationsPortal.Persistence;
using AuctionOperationsPortal.Telemetry;
using Microsoft.Extensions.Logging.Abstractions;

namespace AuctionOperationsPortal.Messaging;

/// <summary>Processes one activity message for persistence and client publication.</summary>
public sealed class ActivityMessageHandler(
    IActivityPersistence persistence,
    IActivityNotificationPublisher? notificationPublisher = null,
    ILogger<ActivityMessageHandler>? logger = null)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly ILogger<ActivityMessageHandler> logger = logger ?? NullLogger<ActivityMessageHandler>.Instance;

    /// <summary>Validates, persists, publishes, and acknowledges one broker delivery.</summary>
    public async Task HandleAsync(ReadOnlyMemory<byte> body, IDeliveryActions actions, ulong deliveryTag, CancellationToken cancellationToken)
    {
        var started = Stopwatch.GetTimestamp();
        using var activity = PortalTelemetry.StartActivity("portal.rabbitmq.process", ActivityKind.Consumer);
        try
        {
            var envelope = JsonSerializer.Deserialize<IntegrationEventEnvelope>(Encoding.UTF8.GetString(body.Span), JsonOptions) ?? throw new FormatException("Message body is empty.");
            PortalTelemetry.AddEventTags(activity, envelope.EventId, envelope.EventType, envelope.AggregateId, envelope.AggregateVersion, envelope.CorrelationId);
            var result = await persistence.PersistAsync(envelope, cancellationToken);
            if (result.Inserted)
                PortalTelemetry.EventsProcessed.Add(1, new KeyValuePair<string, object?>("event_type", envelope.EventType));
            else
                PortalTelemetry.EventsDuplicate.Add(1, new KeyValuePair<string, object?>("event_type", envelope.EventType));
            if (result.Inserted && result.Activity is not null && notificationPublisher is not null)
            {
                try
                {
                    await notificationPublisher.PublishAsync(result.Activity, cancellationToken);
                }
                catch (Exception exception) when (!cancellationToken.IsCancellationRequested)
                {
                    logger.LogError(exception, "SignalR publication failed after activity {EventId} was persisted; acknowledging for client reconciliation.", envelope.EventId);
                }
            }
            await actions.AckAsync(deliveryTag, cancellationToken);
        }
        catch (JsonException)
        {
            PortalTelemetry.EventsRejected.Add(1, new KeyValuePair<string, object?>("reason", "invalid_json"));
            await actions.RejectAsync(deliveryTag, requeue: false, cancellationToken);
        }
        catch (FormatException)
        {
            PortalTelemetry.EventsRejected.Add(1, new KeyValuePair<string, object?>("reason", "invalid_event"));
            await actions.RejectAsync(deliveryTag, requeue: false, cancellationToken);
        }
        catch (Exception) when (!cancellationToken.IsCancellationRequested)
        {
            PortalTelemetry.EventsTransientFailures.Add(1);
            await actions.RequeueAsync(deliveryTag, cancellationToken);
        }
        finally
        {
            PortalTelemetry.EventProcessingDuration.Record(Stopwatch.GetElapsedTime(started).TotalMilliseconds);
        }
    }
}
