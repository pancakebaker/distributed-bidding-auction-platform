using AuctionOperationsPortal.Components;
using AuctionOperationsPortal.Notifications;

namespace AuctionOperationsPortal.Tests;

public sealed class LiveActivityTests
{
    [Fact]
    public void Merge_DeduplicatesByEventIdAndKeepsSameVersionSiblings()
    {
        var state = new LiveActivityState(10);
        var auctionId = Guid.NewGuid();
        var closed = Notification(Guid.NewGuid(), "AuctionClosed", auctionId, 16, DateTimeOffset.UtcNow.AddSeconds(-2));
        var winner = Notification(Guid.NewGuid(), "WinnerSelected", auctionId, 16, DateTimeOffset.UtcNow);

        state.Merge([closed, winner]);

        Assert.Equal(2, state.Items.Count);
        Assert.Equal(16, state.Items[0].AggregateVersion);
        Assert.Equal(16, state.Items[1].AggregateVersion);
    }

    [Fact]
    public void Merge_DuplicateEventReplacesExistingProjectionWithoutGrowing()
    {
        var state = new LiveActivityState(10);
        var eventId = Guid.NewGuid();
        state.Merge([Notification(eventId, "BidAccepted", Guid.NewGuid(), 1, DateTimeOffset.UtcNow)]);
        state.Merge([Notification(eventId, "BidAccepted", Guid.NewGuid(), 2, DateTimeOffset.UtcNow.AddSeconds(1))]);

        Assert.Single(state.Items);
        Assert.Equal(2, state.Items[0].AggregateVersion);
    }

    [Fact]
    public void Merge_IsBoundedAndNewestFirst()
    {
        var state = new LiveActivityState(2);
        var now = DateTimeOffset.UtcNow;
        state.Merge([
            Notification(Guid.NewGuid(), "BidAccepted", Guid.NewGuid(), 1, now.AddSeconds(-2)),
            Notification(Guid.NewGuid(), "BidAccepted", Guid.NewGuid(), 2, now),
            Notification(Guid.NewGuid(), "BidAccepted", Guid.NewGuid(), 3, now.AddSeconds(-1))
        ]);

        Assert.Equal(2, state.Items.Count);
        Assert.Equal(2, state.Items[0].AggregateVersion);
        Assert.Equal(3, state.Items[1].AggregateVersion);
    }

    private static ActivityNotification Notification(Guid eventId, string eventType, Guid aggregateId, long version, DateTimeOffset occurredAt) => new(1, eventId, eventType, aggregateId, version, "correlation", occurredAt, occurredAt, "bidder", 1250m, "winner");
}
