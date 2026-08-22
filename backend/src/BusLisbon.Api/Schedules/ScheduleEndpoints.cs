using Microsoft.Extensions.Options;

namespace BusLisbon.Api.Schedules;

public static class ScheduleEndpoints
{
    public static IEndpointRouteBuilder MapScheduleEndpoints(this IEndpointRouteBuilder routes)
    {
        routes.MapGet("/api/arrivals/by-stop/{stopId}", async (
            string stopId,
            PatternCatalogue catalogue,
            ITmlArrivals arrivals,
            IOptions<TmlOptions> options,
            TimeProvider clock,
            CancellationToken cancellationToken) =>
        {
            var networkStopId = await catalogue.NetworkStopIdAsync(stopId, cancellationToken);

            if (networkStopId is null) return Results.Ok(Array.Empty<object>());

            var zone = TimeZoneInfo.FindSystemTimeZoneById(options.Value.TimeZone);
            var now = clock.GetUtcNow().ToUnixTimeSeconds();
            var today = ScheduleReader.OperationalDay(clock.GetUtcNow(), zone);
            var patternIds = await catalogue.PatternIdsForAsync(networkStopId, cancellationToken);
            var timetable = new List<ScheduledCall>();

            foreach (var patternId in patternIds)
            {
                var pattern = await catalogue.PatternAsync(patternId, cancellationToken);

                if (pattern is null) continue;

                timetable.AddRange(ScheduleReader.CallsAt(pattern, networkStopId, today, zone));
            }

            var live = await arrivals.GetApproachingAsync(networkStopId, now, cancellationToken);
            var etas = live.Values
                .Select(trip => new LiveEta(trip.TripId, trip.PatternId, trip.VehicleId, trip.EtaUnix))
                .ToList();

            var board = StopBoard.Build(timetable, etas, now, BehindWindow, AheadWindow);

            return Results.Ok(board.Select(entry => new
            {
                lineId = LineName(entry.LineId),
                patternId = entry.PatternId,
                headsign = entry.Headsign,
                tripId = entry.TripId,
                vehicleId = entry.VehicleId,
                scheduledUnix = entry.ScheduledUnix,
                estimatedUnix = entry.EstimatedUnix,
                isPast = entry.IsPast,
                isRealtime = entry.IsRealtime
            }).ToList());
        });

        return routes;
    }

    public static readonly TimeSpan BehindWindow = TimeSpan.FromHours(2);

    public static readonly TimeSpan AheadWindow = TimeSpan.FromHours(2);

    public static string LineName(string lineId)
    {
        var cut = lineId.LastIndexOf(']');

        return cut >= 0 && cut < lineId.Length - 1 ? lineId[(cut + 1)..] : lineId;
    }
}
