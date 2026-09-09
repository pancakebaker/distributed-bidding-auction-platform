using System.Text.Json;
using AuctionOperationsPortal.Contracts;
using AuctionOperationsPortal.Messaging;
using AuctionOperationsPortal.Persistence;

namespace AuctionOperationsPortal.Tests;

public sealed class ConsumerBehaviorTests
{
    [Fact]
    public async Task SupportedMessage_PersistsAndAcks()
    {
        var persistence = new FakePersistence(); var actions = new FakeActions();
        await new ActivityMessageHandler(persistence).HandleAsync(JsonSerializer.SerializeToUtf8Bytes(Envelope()), actions, 1, CancellationToken.None);
        Assert.Equal(1, persistence.Calls); Assert.Equal(1, actions.Acks); Assert.Equal(0, actions.Rejects);
    }

    [Fact]
    public async Task MalformedMessage_RejectsToDeadLetterPath()
    {
        var actions = new FakeActions();
        await new ActivityMessageHandler(new FakePersistence()).HandleAsync("not-json"u8.ToArray(), actions, 2, CancellationToken.None);
        Assert.Equal(1, actions.Rejects); Assert.False(actions.Requeue);
    }

    [Fact]
    public async Task DuplicateEvent_IsSuccessfulWhenPersistenceReportsDuplicate()
    {
        var actions = new FakeActions();
        await new ActivityMessageHandler(new FakePersistence { Result = false }).HandleAsync(JsonSerializer.SerializeToUtf8Bytes(Envelope()), actions, 3, CancellationToken.None);
        Assert.Equal(1, actions.Acks); Assert.Equal(0, actions.Rejects);
    }

    [Fact]
    public async Task TransientPersistenceError_Requeues()
    {
        var actions = new FakeActions();
        await new ActivityMessageHandler(new FakePersistence { Error = new InvalidOperationException() }).HandleAsync(JsonSerializer.SerializeToUtf8Bytes(Envelope()), actions, 4, CancellationToken.None);
        Assert.Equal(1, actions.Requeues);
    }

    private static IntegrationEventEnvelope Envelope() => new(Guid.NewGuid(), "AuctionClosed", DateTimeOffset.UtcNow, "Auction", Guid.NewGuid(), 16, null, JsonSerializer.SerializeToElement(new { auctionId = Guid.NewGuid(), closedAtUtc = DateTimeOffset.UtcNow, finalBidAmount = (decimal?)null, finalBidderId = (string?)null, auctionVersion = 16 }));
    private sealed class FakePersistence : IActivityPersistence
    {
        public bool Result { get; init; } = true; public Exception? Error { get; init; } public int Calls { get; private set; }
        public Task<bool> PersistAsync(IntegrationEventEnvelope envelope, CancellationToken cancellationToken) { Calls++; if (Error is not null) throw Error; return Task.FromResult(Result); }
    }
    private sealed class FakeActions : IDeliveryActions
    {
        public int Acks { get; private set; } public int Rejects { get; private set; } public int Requeues { get; private set; } public bool Requeue { get; private set; }
        public Task AckAsync(ulong deliveryTag, CancellationToken cancellationToken) { Acks++; return Task.CompletedTask; }
        public Task RejectAsync(ulong deliveryTag, bool requeue, CancellationToken cancellationToken) { Rejects++; Requeue = requeue; return Task.CompletedTask; }
        public Task RequeueAsync(ulong deliveryTag, CancellationToken cancellationToken) { Requeues++; return Task.CompletedTask; }
    }
}
