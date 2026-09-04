using bidding_service.Domain;
using Microsoft.EntityFrameworkCore;

namespace bidding_service.Data;

public static class DatabaseSeeder
{
    public static readonly Guid OpenAuctionId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    public static readonly Guid ScheduledAuctionId = Guid.Parse("22222222-2222-2222-2222-222222222222");
    public static readonly Guid ClosedAuctionId = Guid.Parse("33333333-3333-3333-3333-333333333333");

    public static async Task SeedAsync(BiddingDbContext db, TimeProvider timeProvider, CancellationToken cancellationToken = default)
    {
        var now = timeProvider.GetUtcNow();
        var createdAt = now.AddDays(-2);

        await UpsertAuctionAsync(db, new Auction
        {
            Id = OpenAuctionId,
            Title = "MacBook Pro",
            Description = "Demo open auction for a laptop.",
            StartingPrice = 1000m,
            MinimumBidIncrement = 50m,
            CurrentBidAmount = 1150m,
            CurrentBidderId = "carol",
            StartTimeUtc = now.AddHours(-2),
            EndTimeUtc = now.AddHours(6),
            Status = AuctionStatus.Open,
            Version = 3,
            CreatedAtUtc = createdAt,
            UpdatedAtUtc = now.AddMinutes(-15)
        }, cancellationToken);

        await UpsertAuctionAsync(db, new Auction
        {
            Id = ScheduledAuctionId,
            Title = "Camera",
            Description = "Demo scheduled auction for a camera kit.",
            StartingPrice = 500m,
            MinimumBidIncrement = 25m,
            CurrentBidAmount = null,
            CurrentBidderId = null,
            StartTimeUtc = now.AddHours(3),
            EndTimeUtc = now.AddHours(10),
            Status = AuctionStatus.Scheduled,
            Version = 1,
            CreatedAtUtc = createdAt,
            UpdatedAtUtc = createdAt
        }, cancellationToken);

        await UpsertAuctionAsync(db, new Auction
        {
            Id = ClosedAuctionId,
            Title = "Gaming Console",
            Description = "Demo closed auction for a gaming console.",
            StartingPrice = 300m,
            MinimumBidIncrement = 20m,
            CurrentBidAmount = 380m,
            CurrentBidderId = "erin",
            StartTimeUtc = now.AddDays(-2),
            EndTimeUtc = now.AddHours(-1),
            Status = AuctionStatus.Closed,
            Version = 2,
            CreatedAtUtc = now.AddDays(-3),
            UpdatedAtUtc = now.AddHours(-1)
        }, cancellationToken);

        await SeedBidAsync(db, OpenAuctionId, Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1"), "alice", 1000m, now.AddMinutes(-75), cancellationToken);
        await SeedBidAsync(db, OpenAuctionId, Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2"), "bob", 1100m, now.AddMinutes(-45), cancellationToken);
        await SeedBidAsync(db, OpenAuctionId, Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3"), "carol", 1150m, now.AddMinutes(-15), cancellationToken);
        await SeedBidAsync(db, ClosedAuctionId, Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1"), "dave", 320m, now.AddDays(-1).AddHours(-2), cancellationToken);
        await SeedBidAsync(db, ClosedAuctionId, Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2"), "erin", 380m, now.AddDays(-1).AddHours(-1), cancellationToken);

        await db.SaveChangesAsync(cancellationToken);
    }

    private static async Task UpsertAuctionAsync(BiddingDbContext db, Auction auction, CancellationToken cancellationToken)
    {
        var existing = await db.Auctions.FindAsync([auction.Id], cancellationToken);
        if (existing is null)
        {
            db.Auctions.Add(auction);
            return;
        }

        existing.Title = auction.Title;
        existing.Description = auction.Description;
        existing.StartingPrice = auction.StartingPrice;
        existing.MinimumBidIncrement = auction.MinimumBidIncrement;
        existing.CurrentBidAmount = auction.CurrentBidAmount;
        existing.CurrentBidderId = auction.CurrentBidderId;
        existing.StartTimeUtc = auction.StartTimeUtc;
        existing.EndTimeUtc = auction.EndTimeUtc;
        existing.Status = auction.Status;
        existing.Version = auction.Version;
        existing.CreatedAtUtc = auction.CreatedAtUtc;
        existing.UpdatedAtUtc = auction.UpdatedAtUtc;
    }

    private static async Task SeedBidAsync(BiddingDbContext db, Guid auctionId, Guid bidId, string bidderId, decimal amount, DateTimeOffset createdAtUtc, CancellationToken cancellationToken)
    {
        if (await db.Bids.AnyAsync(b => b.Id == bidId, cancellationToken))
        {
            return;
        }

        db.Bids.Add(new Bid
        {
            Id = bidId,
            AuctionId = auctionId,
            BidderId = bidderId,
            Amount = amount,
            CreatedAtUtc = createdAtUtc
        });
    }
}
