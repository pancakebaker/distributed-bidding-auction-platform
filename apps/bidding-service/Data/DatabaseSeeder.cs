// <copyright file="DatabaseSeeder.cs" company="Distributed Bidding Auction Platform">
// Copyright (c) Distributed Bidding Auction Platform. Licensed under the MIT license.
// </copyright>
using bidding_service.Domain;
using Microsoft.EntityFrameworkCore;

namespace bidding_service.Data;

/// <summary>
/// Creates deterministic local demo auction data.
/// </summary>
public static class DatabaseSeeder
{
    /// <summary>
    /// Stable identifier for the open MacBook Pro demo auction.
    /// </summary>
    public static readonly Guid OpenAuctionId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    /// <summary>
    /// Stable identifier for the scheduled Camera demo auction.
    /// </summary>
    public static readonly Guid ScheduledAuctionId =
        Guid.Parse("22222222-2222-2222-2222-222222222222");
    /// <summary>
    /// Stable identifier for the closed Gaming Console demo auction.
    /// </summary>
    public static readonly Guid ClosedAuctionId =
        Guid.Parse("33333333-3333-3333-3333-333333333333");

    /// <summary>
    /// Seeds deterministic demo auctions and bid history when the database is empty.
    /// </summary>
    public static async Task SeedAsync(
        BiddingDbContext db,
        TimeProvider timeProvider,
        CancellationToken cancellationToken = default)
    {
        if (await db.Auctions.AnyAsync(cancellationToken))
        {
            return;
        }

        var now = timeProvider.GetUtcNow();
        var createdAt = now.AddDays(-2);

        db.Auctions.AddRange(
            new Auction
            {
                Id = OpenAuctionId,
                Title = "MacBook Pro",
                Description = "Demo open auction for a laptop.",
                StartingPrice = 1000m,
                SaleMode = SaleMode.AuctionOnly,
                MinimumBidIncrement = 50m,
                CurrentBidAmount = 1150m,
                CurrentBidderId = "carol",
                StartTimeUtc = now.AddHours(-2),
                EndTimeUtc = now.AddHours(6),
                Status = AuctionStatus.Open,
                Version = 3,
                CreatedAtUtc = createdAt,
                UpdatedAtUtc = now.AddMinutes(-15)
            },
            new Auction
            {
                Id = ScheduledAuctionId,
                Title = "Camera",
                Description = "Demo scheduled auction for a camera kit.",
                StartingPrice = 500m,
                SaleMode = SaleMode.AuctionOnly,
                MinimumBidIncrement = 25m,
                CurrentBidAmount = null,
                CurrentBidderId = null,
                StartTimeUtc = now.AddHours(3),
                EndTimeUtc = now.AddHours(10),
                Status = AuctionStatus.Scheduled,
                Version = 1,
                CreatedAtUtc = createdAt,
                UpdatedAtUtc = createdAt
            },
            new Auction
            {
                Id = ClosedAuctionId,
                Title = "Gaming Console",
                Description = "Demo closed auction for a gaming console.",
                StartingPrice = 300m,
                SaleMode = SaleMode.AuctionOnly,
                MinimumBidIncrement = 20m,
                CurrentBidAmount = 380m,
                CurrentBidderId = "erin",
                StartTimeUtc = now.AddDays(-2),
                EndTimeUtc = now.AddHours(-1),
                Status = AuctionStatus.Closed,
                Version = 2,
                CreatedAtUtc = now.AddDays(-3),
                UpdatedAtUtc = now.AddHours(-1)
            });

        db.Bids.AddRange(
            new Bid
            {
                Id = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1"),
                AuctionId = OpenAuctionId,
                BidderId = "alice",
                Amount = 1000m,
                CreatedAtUtc = now.AddMinutes(-75)
            },
            new Bid
            {
                Id = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2"),
                AuctionId = OpenAuctionId,
                BidderId = "bob",
                Amount = 1100m,
                CreatedAtUtc = now.AddMinutes(-45)
            },
            new Bid
            {
                Id = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3"),
                AuctionId = OpenAuctionId,
                BidderId = "carol",
                Amount = 1150m,
                CreatedAtUtc = now.AddMinutes(-15)
            },
            new Bid
            {
                Id = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1"),
                AuctionId = ClosedAuctionId,
                BidderId = "dave",
                Amount = 320m,
                CreatedAtUtc = now.AddDays(-1).AddHours(-2)
            },
            new Bid
            {
                Id = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2"),
                AuctionId = ClosedAuctionId,
                BidderId = "erin",
                Amount = 380m,
                CreatedAtUtc = now.AddDays(-1).AddHours(-1)
            });

        await db.SaveChangesAsync(cancellationToken);
    }
}
