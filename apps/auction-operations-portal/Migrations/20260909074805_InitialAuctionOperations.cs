using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace AuctionOperationsPortal.Migrations
{
    /// <inheritdoc />
    public partial class InitialAuctionOperations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "auction_activity",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityAlwaysColumn),
                    event_id = table.Column<Guid>(type: "uuid", nullable: false),
                    event_type = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    aggregate_type = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    aggregate_id = table.Column<Guid>(type: "uuid", nullable: false),
                    aggregate_version = table.Column<long>(type: "bigint", nullable: false),
                    correlation_id = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    occurred_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    processed_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    bid_id = table.Column<Guid>(type: "uuid", nullable: true),
                    bidder_id = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    amount = table.Column<decimal>(type: "numeric(18,2)", nullable: true),
                    winner_id = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    safe_metadata = table.Column<string>(type: "jsonb", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_auction_activity", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "ix_auction_activity_aggregate_id",
                table: "auction_activity",
                column: "aggregate_id");

            migrationBuilder.CreateIndex(
                name: "ix_auction_activity_event_type",
                table: "auction_activity",
                column: "event_type");

            migrationBuilder.CreateIndex(
                name: "ix_auction_activity_occurred_at_utc",
                table: "auction_activity",
                column: "occurred_at_utc");

            migrationBuilder.CreateIndex(
                name: "ux_auction_activity_event_id",
                table: "auction_activity",
                column: "event_id",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "auction_activity");
        }
    }
}
