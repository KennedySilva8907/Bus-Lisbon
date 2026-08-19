using BusLisbon.Api.Observations;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace BusLisbon.Api.Reliability;

public sealed class LinePunctualityQuery(
    ObservationsContext database,
    IOptions<ReliabilityOptions> options,
    TimeProvider time)
{
    public async Task<IReadOnlyList<LinePunctuality>> RunAsync(CancellationToken cancellationToken)
    {
        var settings = options.Value;
        var tolerance = settings.ToleranceSeconds;
        var from = FirstServiceDate(settings);

        var lines = await database.Arrivals
            .Where(arrival => arrival.ServiceDate >= from)
            .GroupBy(arrival => arrival.LineId)
            .Where(line => line.Count() >= settings.MinimumPassages)
            .Select(line => new LinePunctuality(
                line.Key,
                line.Count(),
                line.Average(arrival => (double)(arrival.ObservedUnix - arrival.ScheduledUnix)),
                line.Count(arrival =>
                    arrival.ObservedUnix - arrival.ScheduledUnix <= tolerance
                    && arrival.ScheduledUnix - arrival.ObservedUnix <= tolerance),
                line.Count(arrival => arrival.ObservedUnix - arrival.ScheduledUnix > tolerance),
                line.Count(arrival => arrival.ScheduledUnix - arrival.ObservedUnix > tolerance),
                line.Min(arrival => arrival.ServiceDate),
                line.Max(arrival => arrival.ServiceDate)))
            .ToListAsync(cancellationToken);

        return lines
            .OrderByDescending(line => (double)line.WithinTolerance / line.Passages)
            .ThenByDescending(line => line.Passages)
            .ThenBy(line => line.LineId)
            .ToArray();
    }

    private DateOnly FirstServiceDate(ReliabilityOptions settings)
    {
        var zone = TimeZoneInfo.FindSystemTimeZoneById(settings.TimeZone);
        var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(time.GetUtcNow(), zone).DateTime);

        return today.AddDays(-settings.WindowDays);
    }
}
