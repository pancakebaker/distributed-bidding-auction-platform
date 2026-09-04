using bidding_service.Domain;
using Microsoft.EntityFrameworkCore;

namespace bidding_service.Data;

public sealed class BiddingDbContext(DbContextOptions<BiddingDbContext> options) : DbContext(options)
{
    public DbSet<Auction> Auctions => Set<Auction>();
    public DbSet<Bid> Bids => Set<Bid>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Auction>(auction =>
        {
            auction.ToTable("auctions");
            auction.HasKey(a => a.Id);
            auction.Property(a => a.Id).HasColumnName("id");
            auction.Property(a => a.Title).HasColumnName("title").HasMaxLength(200).IsRequired();
            auction.Property(a => a.Description).HasColumnName("description").HasMaxLength(2000).IsRequired();
            auction.Property(a => a.StartingPrice).HasColumnName("starting_price").HasPrecision(18, 2).IsRequired();
            auction.Property(a => a.MinimumBidIncrement).HasColumnName("minimum_bid_increment").HasPrecision(18, 2).IsRequired();
            auction.Property(a => a.CurrentBidAmount).HasColumnName("current_bid_amount").HasPrecision(18, 2);
            auction.Property(a => a.CurrentBidderId).HasColumnName("current_bidder_id").HasMaxLength(120);
            auction.Property(a => a.StartTimeUtc).HasColumnName("start_time_utc").IsRequired();
            auction.Property(a => a.EndTimeUtc).HasColumnName("end_time_utc").IsRequired();
            auction.Property(a => a.Status).HasColumnName("status").HasConversion<string>().HasMaxLength(40).IsRequired();
            auction.Property(a => a.Version).HasColumnName("version").IsConcurrencyToken().IsRequired();
            auction.Property(a => a.CreatedAtUtc).HasColumnName("created_at_utc").IsRequired();
            auction.Property(a => a.UpdatedAtUtc).HasColumnName("updated_at_utc").IsRequired();
            auction.HasMany(a => a.Bids).WithOne(b => b.Auction).HasForeignKey(b => b.AuctionId).OnDelete(DeleteBehavior.Cascade);
            auction.HasIndex(a => new { a.Status, a.EndTimeUtc }).HasDatabaseName("ix_auctions_status_end_time_utc");
        });

        modelBuilder.Entity<Bid>(bid =>
        {
            bid.ToTable("bids");
            bid.HasKey(b => b.Id);
            bid.Property(b => b.Id).HasColumnName("id");
            bid.Property(b => b.AuctionId).HasColumnName("auction_id");
            bid.Property(b => b.BidderId).HasColumnName("bidder_id").HasMaxLength(120).IsRequired();
            bid.Property(b => b.Amount).HasColumnName("amount").HasPrecision(18, 2).IsRequired();
            bid.Property(b => b.CreatedAtUtc).HasColumnName("created_at_utc").IsRequired();
            bid.HasIndex(b => b.AuctionId).HasDatabaseName("ix_bids_auction_id");
            bid.HasIndex(b => new { b.AuctionId, b.CreatedAtUtc }).HasDatabaseName("ix_bids_auction_id_created_at_utc");
        });
    }
}
