using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BusLisbon.Api.Observations.Migrations
{
    /// <inheritdoc />
    public partial class DropLineReliability : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "LineReliability");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "LineReliability",
                columns: table => new
                {
                    LineId = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    AverageLatenessSeconds = table.Column<double>(type: "float", nullable: false),
                    ComputedAtUnix = table.Column<long>(type: "bigint", nullable: false),
                    Early = table.Column<int>(type: "int", nullable: false),
                    FirstServiceDate = table.Column<DateOnly>(type: "date", nullable: false),
                    LastServiceDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Late = table.Column<int>(type: "int", nullable: false),
                    Passages = table.Column<int>(type: "int", nullable: false),
                    WithinTolerance = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LineReliability", x => x.LineId);
                });
        }
    }
}
