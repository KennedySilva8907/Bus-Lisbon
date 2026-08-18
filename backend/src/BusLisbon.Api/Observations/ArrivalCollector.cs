using BusLisbon.Api.Carris;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace BusLisbon.Api.Observations;

public sealed record CollectionReport(int StopsRead, int StopsFailed, int Seen, int Written);

public sealed class ArrivalCollector(
    ICarrisArrivals arrivals,
    ObservationsContext database,
    IOptions<CollectionOptions> options,
    ILogger<ArrivalCollector> logger)
{
    public async Task<CollectionReport> CollectOnceAsync(
        IReadOnlyList<string> stopIds, CancellationToken cancellationToken)
    {
        var zone = TimeZoneInfo.FindSystemTimeZoneById(options.Value.TimeZone);
        var pending = new List<ArrivalObservation>();
        var read = 0;
        var failed = 0;
        var seen = 0;
        var written = 0;

        foreach (var stopId in stopIds)
        {
            IReadOnlyList<CarrisArrival> stopArrivals;

            try
            {
                stopArrivals = await arrivals.GetArrivalsAsync(stopId, cancellationToken);
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                failed++;
                logger.LogWarning(exception, "Reading arrivals for stop {StopId} failed", stopId);

                continue;
            }

            read++;

            var passages = ObservedPassages.From(stopId, stopArrivals, zone);
            seen += passages.Count;

            pending.AddRange(await OnlyNewAsync(stopId, passages, cancellationToken));

            if (pending.Count >= options.Value.BatchSize)
            {
                written += await FlushAsync(pending, cancellationToken);
            }
        }

        written += await FlushAsync(pending, cancellationToken);

        return new CollectionReport(read, failed, seen, written);
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
