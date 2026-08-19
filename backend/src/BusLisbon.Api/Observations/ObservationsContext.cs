using BusLisbon.Api.Reliability;
using Microsoft.EntityFrameworkCore;

namespace BusLisbon.Api.Observations;

public sealed class ObservationsContext(DbContextOptions<ObservationsContext> options) : DbContext(options)
{
    public DbSet<ArrivalObservation> Arrivals => Set<ArrivalObservation>();

    public DbSet<LineReliability> LineReliability => Set<LineReliability>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        var arrivals = builder.Entity<ArrivalObservation>();

        arrivals.Property(arrival => arrival.LineId).HasMaxLength(32);
        arrivals.Property(arrival => arrival.StopId).HasMaxLength(32);
        arrivals.Property(arrival => arrival.PatternId).HasMaxLength(64);

        arrivals.Ignore(arrival => arrival.LatenessSeconds);
        arrivals.Ignore(arrival => arrival.PredictionErrorSeconds);

        arrivals
            .HasIndex(arrival => new { arrival.StopId, arrival.LineId, arrival.ScheduledUnix })
            .IsUnique();

        arrivals.HasIndex(arrival => arrival.ServiceDate);

        var reliability = builder.Entity<LineReliability>();

        reliability.HasKey(line => line.LineId);
        reliability.Property(line => line.LineId).HasMaxLength(32);
    }
}
