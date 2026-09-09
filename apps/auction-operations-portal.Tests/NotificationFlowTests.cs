using System.Text.Json;
using AuctionOperationsPortal.Contracts;
using AuctionOperationsPortal.Data;
using AuctionOperationsPortal.Messaging;
using AuctionOperationsPortal.Notifications;
using AuctionOperationsPortal.Persistence;

namespace AuctionOperationsPortal.Tests;

public sealed class NotificationFlowTests
{
    [Fact]
    public async Task NewlyPersistedActivityIsPublishedBeforeAck()
    {
        var publisher = new FakePublisher();
        var actions = new RecordingActions(publisher);
        await new ActivityMessageHandler(new FakePersistence(), publisher).HandleAsync(JsonSerializer.SerializeToUtf8Bytes(Envelope()), actions, 1, CancellationToken.None);

        Assert.Equal(1, publisher.Calls);
        Assert.Equal(1, actions.Acks);
        Assert.True(actions.PublishBeforeAck);
    }

    [Fact]
    public async Task DuplicateActivityIsAckedWithoutPublishing()
    {
        var publisher = new FakePublisher();
        var actions = new RecordingActions(publisher);
        await new ActivityMessageHandler(new FakePersistence { Result = false }, publisher).HandleAsync(JsonSerializer.SerializeToUtf8Bytes(Envelope()), actions, 2, CancellationToken.None);

        Assert.Equal(0, publisher.Calls);
        Assert.Equal(1, actions.Acks);
    }

    [Fact]
    public async Task SignalRFailureDoesNotUndoPersistenceOrPreventAck()
    {
        var publisher = new FakePublisher { Error = new InvalidOperationException("transient hub failure") };
        var actions = new RecordingActions(publisher);
        await new ActivityMessageHandler(new FakePersistence(), publisher).HandleAsync(JsonSerializer.SerializeToUtf8Bytes(Envelope()), actions, 3, CancellationToken.None);

        Assert.Equal(1, publisher.Calls);
        Assert.Equal(1, actions.Acks);
        Assert.Equal(0, actions.Requeues);
    }

    private static IntegrationEventEnvelope Envelope() => new(Guid.NewGuid(), "AuctionClosed", DateTimeOffset.UtcNow, "Auction", Guid.NewGuid(), 16, "corr", JsonSerializer.SerializeToElement(new { auctionId = Guid.NewGuid(), auctionVersion = 16 }));

    private sealed class FakePersistence : IActivityPersistence
    {
        public bool Result { get; init; } = true;
        public Task<ActivityPersistenceResult> PersistAsync(IntegrationEventEnvelope envelope, CancellationToken cancellationToken)
        {
            var activity = Result
                ? new AuctionActivity { EventId = envelope.EventId, EventType = envelope.EventType, AggregateType = envelope.AggregateType }
                : null;
            return Task.FromResult(new ActivityPersistenceResult(Result, activity));
        }
    }

    private sealed class FakePublisher : IActivityNotificationPublisher
    {
        public int Calls { get; private set; }
        public Exception? Error { get; init; }
        public Task PublishAsync(AuctionActivity activity, CancellationToken cancellationToken)
        {
            Calls++;
            if (Error is not null) throw Error;
            return Task.CompletedTask;
        }
    }

    private sealed class RecordingActions : IDeliveryActions
    {
        private readonly FakePublisher publisher;
        public RecordingActions(FakePublisher publisher) => this.publisher = publisher;
        public int Acks { get; private set; }
        public int Requeues { get; private set; }
        public bool PublishBeforeAck { get; private set; }
        public Task AckAsync(ulong deliveryTag, CancellationToken cancellationToken)
        {
            PublishBeforeAck = publisher.Calls > 0;
            Acks++;
            return Task.CompletedTask;
        }
        public Task RejectAsync(ulong deliveryTag, bool requeue, CancellationToken cancellationToken) => Task.CompletedTask;
        public Task RequeueAsync(ulong deliveryTag, CancellationToken cancellationToken)
        {
            Requeues++;
            return Task.CompletedTask;
        }
    }
}
