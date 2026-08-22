using BusLisbon.Api.Schedules;
using BusLisbon.Api.Vehicles;
using Microsoft.Extensions.Options;

namespace BusLisbon.Api.Observations;

public sealed record StoppedBus(string StopId, string TripId, string PatternId, string LineId, long AtUnix);

public interface IPassageObserver
{
    Task<IReadOnlyList<ArrivalObservation>> ObserveAsync(
        IReadOnlyList<Vehicle> fleet, IReadOnlySet<string> stopIds, CancellationToken cancellationToken);
}

public sealed class PassageObserver(
    PatternCatalogue catalogue, IOptions<CollectionOptions> options, TimeProvider clock) : IPassageObserver
{
    public const string StoppedAtAStop = "STOPPED_AT";

    public static readonly TimeSpan FarthestFromTheTimetable = TimeSpan.FromHours(3);

    public static bool WorthKeeping(long observedUnix, long scheduledUnix) =>
        Math.Abs(observedUnix - scheduledUnix) <= (long)FarthestFromTheTimetable.TotalSeconds;

    public static IReadOnlyList<StoppedBus> StandingAt(
        IReadOnlyList<Vehicle> fleet, IReadOnlySet<string> stopIds, long nowUnix)
    {
        var standing = new Dictionary<string, StoppedBus>();

        foreach (var vehicle in fleet)
        {
            if (vehicle.CurrentStatus != StoppedAtAStop) continue;
            if (string.IsNullOrEmpty(vehicle.StopId) || !stopIds.Contains(vehicle.StopId)) continue;
            if (string.IsNullOrEmpty(vehicle.TripId) || string.IsNullOrEmpty(vehicle.PatternId)) continue;

            standing[$"{vehicle.StopId}|{VehicleMatcher.BareTripId(vehicle.TripId)}"] = new StoppedBus(
                vehicle.StopId,
                vehicle.TripId,
                vehicle.PatternId,
                vehicle.LineId ?? string.Empty,
                vehicle.Timestamp ?? nowUnix);
        }

        return [.. standing.Values];
    }

    public async Task<IReadOnlyList<ArrivalObservation>> ObserveAsync(
        IReadOnlyList<Vehicle> fleet, IReadOnlySet<string> stopIds, CancellationToken cancellationToken)
    {
        var zone = TimeZoneInfo.FindSystemTimeZoneById(options.Value.TimeZone);
        var now = clock.GetUtcNow();
        var today = ScheduleReader.OperationalDay(now, zone);
        var passages = new List<ArrivalObservation>();

        foreach (var bus in StandingAt(fleet, stopIds, now.ToUnixTimeSeconds()))
        {
            var networkStopId = await catalogue.NetworkStopIdAsync(bus.StopId, cancellationToken);

            if (networkStopId is null) continue;

            var patternIds = await catalogue.PatternIdsForAsync(networkStopId, cancellationToken);
            var patternId = patternIds.FirstOrDefault(id => id.EndsWith($"]{bus.PatternId}", StringComparison.Ordinal));

            if (patternId is null) continue;

            long? scheduled = null;

            foreach (var plan in await catalogue.PatternAsync(patternId, cancellationToken))
            {
                scheduled ??= ScheduleReader.ScheduledFor(plan, networkStopId, bus.TripId, today, zone);
            }

            if (scheduled is not { } scheduledUnix) continue;
            if (!WorthKeeping(bus.AtUnix, scheduledUnix)) continue;

            passages.Add(new ArrivalObservation
            {
                LineId = bus.LineId,
                StopId = bus.StopId,
                PatternId = bus.PatternId,
                ServiceDate = today,
                ScheduledUnix = scheduledUnix,
                EstimatedUnix = null,
                ObservedUnix = bus.AtUnix,
            });
        }

        return passages;
    }
}
