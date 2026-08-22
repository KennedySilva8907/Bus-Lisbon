using BusLisbon.Api.Carris;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace BusLisbon.Api.Observations;

public sealed record CollectionReport(int StopsRead, int StopsFailed, int Seen, int Written);

public sealed class ArrivalCollector(
    ICarrisClient fleet,
    IPassageObserver observer,
    ObservationsContext database,
    IOptions<CollectionOptions> options,
    ILogger<ArrivalCollector> logger)
{
    public async Task<CollectionReport> CollectOnceAsync(
        IReadOnlyList<string> stopIds, CancellationToken cancellationToken)
    {
        IReadOnlyList<Vehicles.Vehicle> buses;

        try
        {
            buses = [.. (await fleet.GetVehiclesAsync(cancellationToken)).Select(Vehicles.Vehicle.From)];
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            logger.LogWarning(exception, "Reading the fleet failed, nothing to record this run");

            return new CollectionReport(0, 1, 0, 0);
        }

        var watched = stopIds.ToHashSet();
        var passages = await observer.ObserveAsync(buses, watched, cancellationToken);
        var pending = new List<ArrivalObservation>();
        var written = 0;

        foreach (var byStop in passages.GroupBy(passage => passage.StopId))
        {
            pending.AddRange(await OnlyNewAsync(byStop.Key, [.. byStop], cancellationToken));

            if (pending.Count >= options.Value.BatchSize)
            {
                written += await FlushAsync(pending, cancellationToken);
            }
        }

        written += await FlushAsync(pending, cancellationToken);

        return new CollectionReport(watched.Count, 0, passages.Count, written);
    }

    private async Task<IReadOnlyList<ArrivalObservation>> OnlyNewAsync(
        string stopId, IReadOnlyList<ArrivalObservation> passages, CancellationToken cancellationToken)
    {
        if (passages.Count == 0)
        {
            return [];
        }

        var scheduled = passages.Select(passage => passage.ScheduledUnix).ToArray();

        var already = await database.Arrivals
            .Where(arrival => arrival.StopId == stopId && scheduled.Contains(arrival.ScheduledUnix))
            .Select(arrival => new { arrival.LineId, arrival.ScheduledUnix })
            .ToListAsync(cancellationToken);

        var known = already.Select(key => (key.LineId, key.ScheduledUnix)).ToHashSet();

        return passages.Where(passage => !known.Contains((passage.LineId, passage.ScheduledUnix))).ToArray();
    }

    private async Task<int> FlushAsync(List<ArrivalObservation> pending, CancellationToken cancellationToken)
    {
        if (pending.Count == 0)
        {
            return 0;
        }

        database.Arrivals.AddRange(pending);
        await database.SaveChangesAsync(cancellationToken);
        database.ChangeTracker.Clear();

        var written = pending.Count;
        pending.Clear();

        return written;
    }
}
