using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BusLisbon.Api.Observations.Migrations
{
    /// <inheritdoc />
    public partial class CreateArrivalObservations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Arrivals",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    LineId = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    StopId = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    PatternId = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    ServiceDate = table.Column<DateOnly>(type: "date", nullable: false),
                    ScheduledUnix = table.Column<long>(type: "bigint", nullable: false),
                    EstimatedUnix = table.Column<long>(type: "bigint", nullable: true),
                    ObservedUnix = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Arrivals", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Arrivals_ServiceDate",
                table: "Arrivals",
                column: "ServiceDate");

            migrationBuilder.CreateIndex(
                name: "IX_Arrivals_StopId_LineId_ScheduledUnix",
                table: "Arrivals",
                columns: new[] { "StopId", "LineId", "ScheduledUnix" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Arrivals");
        }
    }
}
