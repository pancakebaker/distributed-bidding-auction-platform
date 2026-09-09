using System.Diagnostics;
using System.Diagnostics.Metrics;
using System.Text.Json;
using AuctionOperationsPortal.Contracts;
using AuctionOperationsPortal.Health;
using AuctionOperationsPortal.Messaging;
using AuctionOperationsPortal.Options;
using AuctionOperationsPortal.Persistence;
using AuctionOperationsPortal.Telemetry;
using Microsoft.Extensions.Options;

namespace AuctionOperationsPortal.Tests;

public sealed class ObservabilityTests
{
    [Fact]
    public async Task MessageProcessing_CreatesCorrelationAwareActivity()
    {
        Activity? captured = null;
        using var listener = new ActivityListener
        {
            ShouldListenTo = source => source.Name == PortalTelemetry.ActivitySourceName,
            Sample = (ref ActivityCreationOptions<ActivityContext> _) => ActivitySamplingResult.AllData,
            ActivityStopped = activity =>
            {
                if (activity.OperationName == "portal.rabbitmq.process" && activity.GetTagItem("event.type") as string == "BidAccepted")
                    captured = activity;
            }
        };
        ActivitySource.AddActivityListener(listener);

        await new ActivityMessageHandler(new FakePersistence()).HandleAsync(
            JsonSerializer.SerializeToUtf8Bytes(Envelope()),
            new FakeActions(),
            1,
            CancellationToken.None);

        Assert.NotNull(captured);
        Assert.Equal("BidAccepted", captured!.GetTagItem("event.type"));
        Assert.Equal("correlation-test", captured.GetTagItem("correlation.id"));
        Assert.Equal("7", captured.GetTagItem("aggregate.version")?.ToString());
    }

    [Fact]
    public async Task DuplicateProcessing_IncrementsDuplicateMetric()
    {
        long duplicates = 0;
        using var listener = new MeterListener();
        listener.InstrumentPublished = (instrument, meterListener) =>
        {
            if (instrument.Meter.Name == PortalTelemetry.MeterName)
                meterListener.EnableMeasurementEvents(instrument);
        };
        listener.SetMeasurementEventCallback<long>((instrument, measurement, tags, _) =>
        {
            var isBidAccepted = false;
            foreach (var tag in tags)
            {
                if (tag.Key == "event_type" && tag.Value as string == "BidAccepted")
                    isBidAccepted = true;
            }
            if (instrument.Name == "portal.events.duplicate" && isBidAccepted)
                Interlocked.Add(ref duplicates, measurement);
        });
        listener.Start();

        await new ActivityMessageHandler(new FakePersistence { Inserted = false }).HandleAsync(
            JsonSerializer.SerializeToUtf8Bytes(Envelope()),
            new FakeActions(),
            2,
            CancellationToken.None);

        Assert.Equal(1, duplicates);
    }

    [Fact]
    public async Task FailedRabbitMqHealthCheck_ReturnsUnhealthyWithoutThrowing()
    {
        var check = new RabbitMqHealthCheck(Microsoft.Extensions.Options.Options.Create(new RabbitMqOptions
        {
            HostName = "127.0.0.1",
            Port = 1,
            UserName = "invalid",
            Password = "invalid"
        }));

        var result = await check.CheckHealthAsync(new Microsoft.Extensions.Diagnostics.HealthChecks.HealthCheckContext());

        Assert.Equal(Microsoft.Extensions.Diagnostics.HealthChecks.HealthStatus.Unhealthy, result.Status);
        Assert.Equal("RabbitMQ is unavailable.", result.Description);
    }

    private static IntegrationEventEnvelope Envelope() => new(
        Guid.NewGuid(),
        "BidAccepted",
        DateTimeOffset.UtcNow,
        "Auction",
        Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
        7,
        "correlation-test",
        JsonSerializer.SerializeToElement(new
        {
            bidId = Guid.NewGuid(),
            auctionId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
            bidderId = "bidder",
            amount = 1250m,
            occurredAtUtc = DateTimeOffset.UtcNow,
            auctionVersion = 7
        }));

    private sealed class FakePersistence : IActivityPersistence
    {
        public bool Inserted { get; init; } = true;

        public Task<ActivityPersistenceResult> PersistAsync(IntegrationEventEnvelope envelope, CancellationToken cancellationToken)
        {
            var activity = Inserted ? new AuctionOperationsPortal.Data.AuctionActivity
            {
                EventId = envelope.EventId,
                EventType = envelope.EventType,
                AggregateType = envelope.AggregateType,
                AggregateId = envelope.AggregateId,
                AggregateVersion = envelope.AggregateVersion,
                CorrelationId = envelope.CorrelationId
            } : null;
            return Task.FromResult(new ActivityPersistenceResult(Inserted, activity));
        }
    }

    private sealed class FakeActions : IDeliveryActions
    {
        public Task AckAsync(ulong deliveryTag, CancellationToken cancellationToken) => Task.CompletedTask;
        public Task RejectAsync(ulong deliveryTag, bool requeue, CancellationToken cancellationToken) => Task.CompletedTask;
        public Task RequeueAsync(ulong deliveryTag, CancellationToken cancellationToken) => Task.CompletedTask;
    }
}
