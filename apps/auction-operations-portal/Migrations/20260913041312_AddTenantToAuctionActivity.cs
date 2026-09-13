using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AuctionOperationsPortal.Migrations
{
    /// <inheritdoc />
    public partial class AddTenantToAuctionActivity : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "tenant_id",
                table: "auction_activity",
                type: "uuid",
                nullable: true);

            migrationBuilder.Sql(
                "UPDATE auction_activity SET tenant_id = 'aaaaaaaa-1111-4111-8111-111111111111' WHERE tenant_id IS NULL;");

            migrationBuilder.AlterColumn<Guid>(
                name: "tenant_id",
                table: "auction_activity",
                type: "uuid",
                nullable: false,
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_auction_activity_tenant_id",
                table: "auction_activity",
                column: "tenant_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_auction_activity_tenant_id",
                table: "auction_activity");

            migrationBuilder.DropColumn(
                name: "tenant_id",
                table: "auction_activity");
        }
    }
}
