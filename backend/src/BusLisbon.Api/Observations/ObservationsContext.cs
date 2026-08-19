using Microsoft.EntityFrameworkCore;

namespace BusLisbon.Api.Observations;

public sealed class ObservationsContext(DbContextOptions<ObservationsContext> options) : DbContext(options)
{
    public DbSet<ArrivalObservation> Arrivals => Set<ArrivalObservation>();

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
    }
}
