using Microsoft.Extensions.Options;

namespace BusLisbon.Api.Schedules;

public sealed class PassageWatcher(
    PassageLog log,
    PatternCatalogue catalogue,
    IServiceScopeFactory scopes,
    IOptions<TmlOptions> options,
    TimeProvider clock,
    ILogger<PassageWatcher> logger) : BackgroundService
{
    public static readonly TimeSpan Every = TimeSpan.FromSeconds(30);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var ticks = new PeriodicTimer(Every, clock);

        while (await ticks.WaitForNextTickAsync(stoppingToken))
        {
            foreach (var stopId in log.Watching())
            {
                try
                {
                    await SweepAsync(stopId, stoppingToken);
                }
                catch (Exception failure) when (failure is not OperationCanceledException)
                {
                    logger.LogWarning(failure, "Could not sweep arrivals for stop {StopId}", stopId);
                }
            }
        }
    }

    private async Task SweepAsync(string stopId, CancellationToken cancellationToken)
    {
        using var scope = scopes.CreateScope();
        var arrivals = scope.ServiceProvider.GetRequiredService<ITmlArrivals>();
        var now = clock.GetUtcNow().ToUnixTimeSeconds();
        var current = await arrivals.GetApproachingAsync(stopId, now, cancellationToken);
        var before = log.LastSeenAt(stopId);
        var gone = PassageDetector.Passed(before, current, now);

        if (gone.Count > 0)
        {
            var zone = TimeZoneInfo.FindSystemTimeZoneById(options.Value.TimeZone);
            var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(clock.GetUtcNow(), zone).DateTime);
            var observed = new List<ObservedPassage>();

            foreach (var trip in gone)
            {
                var pattern = await catalogue.PatternAsync(trip.PatternId, cancellationToken);
                var scheduled = pattern is null
                    ? 0
                    : ScheduleReader.ScheduledFor(pattern, stopId, trip.TripId, today, zone) ?? 0;

                observed.Add(new ObservedPassage(
                    trip.TripId,
                    trip.PatternId,
                    trip.LineId,
                    pattern?.Headsign ?? string.Empty,
                    now,
                    scheduled));
            }

            log.Record(stopId, observed);
        }

        log.Remember(stopId, current);
    }
}
