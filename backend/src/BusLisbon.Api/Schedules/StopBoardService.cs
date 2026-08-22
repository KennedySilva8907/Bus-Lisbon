using BusLisbon.Api.Vehicles;
using Microsoft.Extensions.Options;

namespace BusLisbon.Api.Schedules;

public sealed class StopBoardService(
    PatternCatalogue catalogue,
    ITmlArrivals arrivals,
    VehicleGateway fleet,
    IOptions<TmlOptions> options,
    TimeProvider clock)
{
    public static readonly TimeSpan BehindWindow = TimeSpan.FromHours(2);

    public static readonly TimeSpan AheadWindow = TimeSpan.FromHours(2);

    public async Task<IReadOnlyList<BoardEntry>> ForStopAsync(
        string stopId, CancellationToken cancellationToken)
    {
        var networkStopId = await catalogue.NetworkStopIdAsync(stopId, cancellationToken);

        if (networkStopId is null) return [];

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

        return StopBoard.Build(timetable, etas, now, BehindWindow, AheadWindow, fleetByTrip);
    }
}
