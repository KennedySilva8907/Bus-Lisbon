using BusLisbon.Api.Vehicles;
using Microsoft.Extensions.Options;

namespace BusLisbon.Api.Schedules;

public sealed class StopBoardService(
    PatternCatalogue catalogue,
    ITmlArrivals arrivals,
    VehicleGateway fleet,
    ShapeCatalogue shapes,
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
        var place = await catalogue.PlaceOfAsync(networkStopId, cancellationToken);
        var leftOurStop = await LeftOurStopAsync(timetable, fleetByTrip, networkStopId, place, cancellationToken);

        return StopBoard.Build(timetable, etas, now, BehindWindow, AheadWindow, fleetByTrip, leftOurStop);
    }

    private async Task<IReadOnlySet<string>> LeftOurStopAsync(
        IReadOnlyList<ScheduledCall> timetable,
        IReadOnlyDictionary<string, RunningBus> fleetByTrip,
        string stopId,
        Place? place,
        CancellationToken cancellationToken)
    {
        var left = new HashSet<string>();

        if (place is null) return left;

        foreach (var call in timetable)
        {
            var bus = StopBoard.ClosestToTheSchedule(call, fleetByTrip)?.Bus;

            if (bus is null || left.Contains(bus.VehicleId) || !StopBoard.MightHaveLeft(bus, stopId, place)) continue;

            var shape = await shapes.ForPatternAsync(call.PatternId, cancellationToken);

            if (shape is not null && shape.HasLeft(place, new Place(bus.Lat!.Value, bus.Lon!.Value)))
            {
                left.Add(bus.VehicleId);
            }
        }

        return left;
    }
}
