using Microsoft.EntityFrameworkCore;

namespace AuctionOperationsPortal.Data;

public sealed class AuctionOperationsDbContext(DbContextOptions<AuctionOperationsDbContext> options) : DbContext(options)
{
    public DbSet<AuctionActivity> AuctionActivities => Set<AuctionActivity>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var entity = modelBuilder.Entity<AuctionActivity>();
        entity.ToTable("auction_activity");
        entity.HasKey(activity => activity.Id);
        entity.Property(activity => activity.Id).UseIdentityAlwaysColumn();
        entity.Property(activity => activity.EventId).HasColumnName("event_id");
        entity.HasIndex(activity => activity.EventId).IsUnique().HasDatabaseName("ux_auction_activity_event_id");
        entity.Property(activity => activity.EventType).HasColumnName("event_type").HasMaxLength(100).IsRequired();
        entity.Property(activity => activity.AggregateType).HasColumnName("aggregate_type").HasMaxLength(100).IsRequired();
        entity.Property(activity => activity.AggregateId).HasColumnName("aggregate_id");
        entity.Property(activity => activity.AggregateVersion).HasColumnName("aggregate_version");
        entity.Property(activity => activity.CorrelationId).HasColumnName("correlation_id").HasMaxLength(200);
        entity.Property(activity => activity.OccurredAtUtc).HasColumnName("occurred_at_utc");
        entity.Property(activity => activity.ProcessedAtUtc).HasColumnName("processed_at_utc");
        entity.Property(activity => activity.BidId).HasColumnName("bid_id");
        entity.Property(activity => activity.BidderId).HasColumnName("bidder_id").HasMaxLength(200);
        entity.Property(activity => activity.Amount).HasColumnName("amount").HasColumnType("numeric(18,2)");
        entity.Property(activity => activity.WinnerId).HasColumnName("winner_id").HasMaxLength(200);
        entity.Property(activity => activity.SafeMetadataJson).HasColumnName("safe_metadata").HasColumnType("jsonb");
        entity.HasIndex(activity => activity.OccurredAtUtc).HasDatabaseName("ix_auction_activity_occurred_at_utc");
        entity.HasIndex(activity => activity.AggregateId).HasDatabaseName("ix_auction_activity_aggregate_id");
        entity.HasIndex(activity => activity.EventType).HasDatabaseName("ix_auction_activity_event_type");
    }
}
