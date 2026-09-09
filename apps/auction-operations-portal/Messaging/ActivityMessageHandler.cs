using System.Text;
using System.Text.Json;
using AuctionOperationsPortal.Contracts;
using AuctionOperationsPortal.Notifications;
using AuctionOperationsPortal.Persistence;
using Microsoft.Extensions.Logging.Abstractions;

namespace AuctionOperationsPortal.Messaging;

public sealed class ActivityMessageHandler(
    IActivityPersistence persistence,
    IActivityNotificationPublisher? notificationPublisher = null,
    ILogger<ActivityMessageHandler>? logger = null)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly ILogger<ActivityMessageHandler> logger = logger ?? NullLogger<ActivityMessageHandler>.Instance;

    public async Task HandleAsync(ReadOnlyMemory<byte> body, IDeliveryActions actions, ulong deliveryTag, CancellationToken cancellationToken)
    {
        try
        {
            var envelope = JsonSerializer.Deserialize<IntegrationEventEnvelope>(Encoding.UTF8.GetString(body.Span), JsonOptions) ?? throw new FormatException("Message body is empty.");
            var result = await persistence.PersistAsync(envelope, cancellationToken);
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
            await actions.RejectAsync(deliveryTag, requeue: false, cancellationToken);
        }
        catch (FormatException)
        {
            await actions.RejectAsync(deliveryTag, requeue: false, cancellationToken);
        }
        catch (Exception) when (!cancellationToken.IsCancellationRequested)
        {
            await actions.RequeueAsync(deliveryTag, cancellationToken);
        }
    }
}
