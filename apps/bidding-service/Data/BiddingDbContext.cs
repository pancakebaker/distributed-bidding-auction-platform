// <copyright file="BiddingDbContext.cs" company="Distributed Bidding Auction Platform">
// Copyright (c) Distributed Bidding Auction Platform. Licensed under the MIT license.
// </copyright>
using bidding_service.Domain;
using Microsoft.EntityFrameworkCore;

namespace bidding_service.Data;

/// <summary>
/// Configures EF Core persistence for auctions, bids, and outbox messages.
/// </summary>
public sealed class BiddingDbContext(
    DbContextOptions<BiddingDbContext> options) : DbContext(options)
{
    /// <summary>
    /// Gets the auctions.
    /// </summary>
    public DbSet<Auction> Auctions => Set<Auction>();
    /// <summary>
    /// Gets or sets the accepted bid history for the auction.
    /// </summary>
    public DbSet<Bid> Bids => Set<Bid>();
    /// <summary>
    /// Gets the outbox messages.
    /// </summary>
    public DbSet<OutboxMessage> OutboxMessages => Set<OutboxMessage>();

    /// <summary>
    /// Runs the on model creating operation.
    /// </summary>
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Auction>(auction =>
        {
            auction.ToTable("auctions");
            auction.HasKey(a => a.Id);
            auction.Property(a => a.Id).HasColumnName("id");
            auction.Property(a => a.Title)
                .HasColumnName("title")
                .HasMaxLength(200)
                .IsRequired();
            auction.Property(a => a.Description)
                .HasColumnName("description")
                .HasMaxLength(2000)
                .IsRequired();
            auction.Property(a => a.StartingPrice)
                .HasColumnName("starting_price")
                .HasPrecision(18, 2)
                .IsRequired();
            auction.Property(a => a.MinimumBidIncrement)
                .HasColumnName("minimum_bid_increment")
                .HasPrecision(18, 2)
                .IsRequired();
            auction.Property(a => a.CurrentBidAmount)
                .HasColumnName("current_bid_amount")
                .HasPrecision(18, 2);
            auction.Property(a => a.CurrentBidderId)
                .HasColumnName("current_bidder_id")
                .HasMaxLength(120);
            auction.Property(a => a.StartTimeUtc).HasColumnName("start_time_utc").IsRequired();
            auction.Property(a => a.EndTimeUtc).HasColumnName("end_time_utc").IsRequired();
            auction.Property(a => a.Status)
                .HasColumnName("status")
                .HasConversion<string>()
                .HasMaxLength(40)
                .IsRequired();
            auction.Property(a => a.Version)
                .HasColumnName("version")
                .IsConcurrencyToken()
                .IsRequired();
            auction.Property(a => a.CreatedAtUtc).HasColumnName("created_at_utc").IsRequired();
            auction.Property(a => a.UpdatedAtUtc).HasColumnName("updated_at_utc").IsRequired();
            auction.HasMany(a => a.Bids)
                .WithOne(b => b.Auction)
                .HasForeignKey(b => b.AuctionId)
                .OnDelete(DeleteBehavior.Cascade);
            auction.HasIndex(a => new { a.Status, a.EndTimeUtc })
                .HasDatabaseName("ix_auctions_status_end_time_utc");
        });

        modelBuilder.Entity<Bid>(bid =>
        {
            bid.ToTable("bids");
            bid.HasKey(b => b.Id);
            bid.Property(b => b.Id).HasColumnName("id");
            bid.Property(b => b.AuctionId).HasColumnName("auction_id");
            bid.Property(b => b.BidderId)
                .HasColumnName("bidder_id")
                .HasMaxLength(120)
                .IsRequired();
            bid.Property(b => b.Amount).HasColumnName("amount").HasPrecision(18, 2).IsRequired();
            bid.Property(b => b.CreatedAtUtc).HasColumnName("created_at_utc").IsRequired();
            bid.HasIndex(b => b.AuctionId).HasDatabaseName("ix_bids_auction_id");
            bid.HasIndex(b => new { b.AuctionId, b.CreatedAtUtc })
                .HasDatabaseName("ix_bids_auction_id_created_at_utc");
        });

        modelBuilder.Entity<OutboxMessage>(outbox =>
        {
            outbox.ToTable("outbox_messages");
            outbox.HasKey(m => m.Id);
            outbox.Property(m => m.Id).HasColumnName("id");
            outbox.Property(m => m.EventType)
                .HasColumnName("event_type")
                .HasMaxLength(120)
                .IsRequired();
            outbox.Property(m => m.AggregateType)
                .HasColumnName("aggregate_type")
                .HasMaxLength(120)
                .IsRequired();
            outbox.Property(m => m.AggregateId).HasColumnName("aggregate_id").IsRequired();
            outbox.Property(m => m.AggregateVersion)
                .HasColumnName("aggregate_version")
                .IsRequired();
            outbox.Property(m => m.OccurredAtUtc).HasColumnName("occurred_at_utc").IsRequired();
            outbox.Property(m => m.CorrelationId)
                .HasColumnName("correlation_id")
                .HasMaxLength(120);
            outbox.Property(m => m.Payload)
                .HasColumnName("payload")
                .HasColumnType("jsonb")
                .IsRequired();
            outbox.Property(m => m.CreatedAtUtc).HasColumnName("created_at_utc").IsRequired();
            outbox.Property(m => m.PublishedAtUtc).HasColumnName("published_at_utc");
            outbox.Property(m => m.PublishAttempts)
                .HasColumnName("publish_attempts")
                .HasDefaultValue(0)
                .IsRequired();
            outbox.Property(m => m.LastError)
                .HasColumnName("last_error")
                .HasMaxLength(2000);
            outbox.HasIndex(m => new { m.PublishedAtUtc, m.CreatedAtUtc })
                .HasDatabaseName("ix_outbox_messages_published_at_created_at");
            outbox.HasIndex(m => new { m.AggregateId, m.AggregateVersion })
                .HasDatabaseName("ix_outbox_messages_aggregate_id_version");
        });
    }
}
