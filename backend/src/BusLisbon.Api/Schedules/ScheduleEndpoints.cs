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
            Vehicles.VehicleGateway fleet,
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
                foreach (var plan in await catalogue.PatternAsync(patternId, cancellationToken))
                {
                    timetable.AddRange(ScheduleReader.CallsAt(plan, networkStopId, today, zone));
                }
            }

            var live = await arrivals.GetApproachingAsync(networkStopId, cancellationToken);
            var etas = live.Values
                .Select(trip => new LiveEta(trip.TripId, trip.PatternId, trip.VehicleId, trip.EtaUnix))
                .ToList();

            var fleetByTrip = await fleet.GetVehiclesByTripAsync(cancellationToken);
            var board = StopBoard.Build(timetable, etas, now, BehindWindow, AheadWindow, fleetByTrip);

            return Results.Ok(board.Select(entry => new
            {
                lineId = WithoutAgency(entry.LineId),
                patternId = WithoutAgency(entry.PatternId),
                headsign = entry.Headsign,
                tripId = entry.TripId,
                vehicleId = entry.VehicleId,
                scheduledUnix = entry.ScheduledUnix,
                estimatedUnix = entry.EstimatedUnix,
                isPast = entry.IsPast,
                isRealtime = entry.IsRealtime,
                tripRunning = entry.TripRunning
            }).ToList());
        });

        return routes;
    }

    public static readonly TimeSpan BehindWindow = TimeSpan.FromHours(2);

    public static readonly TimeSpan AheadWindow = TimeSpan.FromHours(2);

    public static string WithoutAgency(string id)
    {
        var cut = id.LastIndexOf(']');

        return cut >= 0 && cut < id.Length - 1 ? id[(cut + 1)..] : id;
    }
}
