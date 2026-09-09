using System.Collections.Concurrent;
using System.Diagnostics;
using System.Text;
using System.Text.Json;
using AuctionOperationsPortal.Contracts;
using AuctionOperationsPortal.Notifications;
using AuctionOperationsPortal.Options;
using AuctionOperationsPortal.Persistence;
using AuctionOperationsPortal.Telemetry;
using Microsoft.Extensions.Options;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;

namespace AuctionOperationsPortal.Messaging;

public interface IDeliveryActions
{
    Task AckAsync(ulong deliveryTag, CancellationToken cancellationToken);
    Task RejectAsync(ulong deliveryTag, bool requeue, CancellationToken cancellationToken);
    Task RequeueAsync(ulong deliveryTag, CancellationToken cancellationToken);
}

public sealed class AuctionActivityConsumer(
    IServiceScopeFactory scopeFactory,
    RabbitMqTopology topology,
    IOptions<RabbitMqOptions> options,
    IActivityNotificationPublisher notificationPublisher,
    ILogger<AuctionActivityConsumer> logger) : BackgroundService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly ConcurrentDictionary<Guid, int> retryCounts = new();

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var config = options.Value;
        var factory = new ConnectionFactory { HostName = config.HostName, Port = config.Port, UserName = config.UserName, Password = config.Password, VirtualHost = config.VirtualHost, AutomaticRecoveryEnabled = true, ClientProvidedName = "dbap-auction-operations-portal" };
        await using var connection = await factory.CreateConnectionAsync(stoppingToken);
        await using var channel = await connection.CreateChannelAsync(cancellationToken: stoppingToken);
        await topology.DeclareAsync(channel, stoppingToken);
        await channel.BasicQosAsync(0, config.PrefetchCount, global: false, stoppingToken);
        var consumer = new AsyncEventingBasicConsumer(channel);
        consumer.ReceivedAsync += (_, args) => HandleAsync(channel, args, stoppingToken);
        await channel.BasicConsumeAsync(config.Queue, autoAck: false, consumer, stoppingToken);
        logger.LogInformation("Auction Operations activity consumer started on {Queue}.", config.Queue);
        try
        {
            await Task.Delay(Timeout.InfiniteTimeSpan, stoppingToken);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
        }
    }

    private async Task HandleAsync(IChannel channel, BasicDeliverEventArgs args, CancellationToken cancellationToken)
    {
        IntegrationEventEnvelope? envelope = null;
        var started = Stopwatch.GetTimestamp();
        using var activity = PortalTelemetry.StartActivity("portal.rabbitmq.process", ActivityKind.Consumer);
        try
        {
            envelope = JsonSerializer.Deserialize<IntegrationEventEnvelope>(Encoding.UTF8.GetString(args.Body.Span), JsonOptions);
            if (envelope is null) throw new FormatException("Message body is empty.");
            PortalTelemetry.AddEventTags(activity, envelope.EventId, envelope.EventType, envelope.AggregateId, envelope.AggregateVersion, envelope.CorrelationId);
            using var logScope = logger.BeginScope(new Dictionary<string, object?>
            {
                ["EventId"] = envelope.EventId,
                ["EventType"] = envelope.EventType,
                ["AggregateId"] = envelope.AggregateId,
                ["AggregateVersion"] = envelope.AggregateVersion,
                ["CorrelationId"] = envelope.CorrelationId,
                ["TraceId"] = activity?.TraceId.ToString(),
                ["SpanId"] = activity?.SpanId.ToString()
            });
            using var serviceScope = scopeFactory.CreateScope();
            var persistence = serviceScope.ServiceProvider.GetRequiredService<IActivityPersistence>();
            var result = await persistence.PersistAsync(envelope, cancellationToken);
            if (result.Inserted)
                PortalTelemetry.EventsProcessed.Add(1, new KeyValuePair<string, object?>("event_type", envelope.EventType));
            else
                PortalTelemetry.EventsDuplicate.Add(1, new KeyValuePair<string, object?>("event_type", envelope.EventType));
            if (result.Inserted && result.Activity is not null)
            {
                try
                {
                    await notificationPublisher.PublishAsync(result.Activity, cancellationToken);
                }
                catch (Exception exception) when (!cancellationToken.IsCancellationRequested)
                {
                    logger.LogError(exception, "SignalR publication failed after activity {EventId} was persisted; acknowledging the message for client reconciliation.", envelope.EventId);
                }
            }
            retryCounts.TryRemove(envelope.EventId, out _);
            await channel.BasicAckAsync(args.DeliveryTag, multiple: false, cancellationToken);
            logger.LogInformation("Persisted auction activity {EventId} ({EventType}).", envelope.EventId, envelope.EventType);
        }
        catch (FormatException exception)
        {
            PortalTelemetry.EventsRejected.Add(1, new KeyValuePair<string, object?>("reason", "invalid_event"));
            logger.LogWarning(exception, "Rejecting malformed auction activity message.");
            await channel.BasicRejectAsync(args.DeliveryTag, requeue: false, cancellationToken);
        }
        catch (JsonException exception)
        {
            PortalTelemetry.EventsRejected.Add(1, new KeyValuePair<string, object?>("reason", "invalid_json"));
            logger.LogWarning(exception, "Rejecting invalid auction activity JSON.");
            await channel.BasicRejectAsync(args.DeliveryTag, requeue: false, cancellationToken);
        }
        catch (Exception exception) when (!cancellationToken.IsCancellationRequested)
        {
            PortalTelemetry.EventsTransientFailures.Add(1);
            var attempts = envelope is null ? options.Value.MaxRequeueAttempts : retryCounts.AddOrUpdate(envelope.EventId, 1, (_, current) => current + 1);
            logger.LogError(exception, "Transient failure processing auction activity; attempt {Attempt}.", attempts);
            if (attempts >= options.Value.MaxRequeueAttempts)
            {
                if (envelope is not null) retryCounts.TryRemove(envelope.EventId, out _);
                await channel.BasicRejectAsync(args.DeliveryTag, requeue: false, cancellationToken);
            }
            else
            {
                await channel.BasicNackAsync(args.DeliveryTag, multiple: false, requeue: true, cancellationToken);
            }
        }
        finally
        {
            PortalTelemetry.EventProcessingDuration.Record(Stopwatch.GetElapsedTime(started).TotalMilliseconds);
        }
    }
}
