using System.Text;
using System.Text.Json;
using AuctionOperationsPortal.Contracts;
using AuctionOperationsPortal.Persistence;

namespace AuctionOperationsPortal.Messaging;

public sealed class ActivityMessageHandler(IActivityPersistence persistence)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task HandleAsync(ReadOnlyMemory<byte> body, IDeliveryActions actions, ulong deliveryTag, CancellationToken cancellationToken)
    {
        try
        {
            var envelope = JsonSerializer.Deserialize<IntegrationEventEnvelope>(Encoding.UTF8.GetString(body.Span), JsonOptions) ?? throw new FormatException("Message body is empty.");
            await persistence.PersistAsync(envelope, cancellationToken);
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
