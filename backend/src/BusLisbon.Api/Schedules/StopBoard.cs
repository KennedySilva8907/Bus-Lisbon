namespace BusLisbon.Api.Schedules;

public sealed record BoardEntry(
    string LineId,
    string PatternId,
    string Headsign,
    string TripId,
    string VehicleId,
    long ScheduledUnix,
    long EstimatedUnix,
    long EffectiveUnix,
    bool IsPast,
    bool IsRealtime,
    bool TripRunning,
    bool FromTheBus = false);

public sealed record LiveEta(string TripId, string PatternId, string VehicleId, long EstimatedUnix);

public sealed record ReckonedArrival(
    Vehicles.RunningBus Bus, long EstimatedUnix, long OffScheduleSeconds);

public static class StopBoard
{
    public static IReadOnlyList<BoardEntry> Build(
        IReadOnlyList<ScheduledCall> timetable,
        IReadOnlyList<LiveEta> etas,
        long nowUnix,
        TimeSpan behind,
        TimeSpan ahead,
        IReadOnlyDictionary<string, Vehicles.RunningBus>? fleetByTrip = null)
    {
        var byTrip = new Dictionary<string, LiveEta>();

        foreach (var eta in etas)
        {
            byTrip[ScheduleReader.TripKey(eta.TripId)] = eta;
        }

        var board = new List<BoardEntry>();

        foreach (var call in timetable)
        {
            if (call.IsLastStop) continue;

            var published = Matching(byTrip, call.TripKeys);
            var running = OnTheRoad(fleetByTrip, call.TripKeys);
            var reckoned = ClosestToTheSchedule(call, fleetByTrip);
            var eta = published is not null
                && Within(published.EstimatedUnix, nowUnix, behind, ahead)
                && NearItsDeparture(published.EstimatedUnix, call.ScheduledUnix)
                    ? published
                    : null;

            var estimated = eta?.EstimatedUnix ?? reckoned?.EstimatedUnix ?? 0;
            var effective = estimated != 0 ? estimated : call.ScheduledUnix;

            if (!Within(effective, nowUnix, behind, ahead)) continue;

            var gone = effective < nowUnix && !HasNotGoneBy(call, reckoned?.Bus);

            board.Add(new BoardEntry(
                call.LineId,
                call.PatternId,
                call.Headsign,
                eta?.TripId ?? call.TripKeys.FirstOrDefault() ?? string.Empty,
                eta?.VehicleId ?? reckoned?.Bus.VehicleId ?? running?.VehicleId ?? string.Empty,
                call.ScheduledUnix,
                estimated,
                effective,
                gone,
                estimated != 0,
                eta is not null || running is not null,
                eta is null && estimated != 0));
        }

        return [.. board.OrderBy(entry => entry.EffectiveUnix)];
    }

    private static Vehicles.RunningBus? OnTheRoad(
        IReadOnlyDictionary<string, Vehicles.RunningBus>? fleetByTrip, IReadOnlyList<string> tripKeys)
    {
        if (fleetByTrip is null) return null;

        foreach (var key in tripKeys)
        {
            if (fleetByTrip.TryGetValue(Vehicles.VehicleMatcher.BareTripId(key), out var bus)) return bus;
        }

        return null;
    }

    public static readonly TimeSpan FarthestFromTheSchedule = TimeSpan.FromMinutes(30);

    public static ReckonedArrival? ClosestToTheSchedule(
        ScheduledCall call, IReadOnlyDictionary<string, Vehicles.RunningBus>? fleetByTrip)
    {
        if (fleetByTrip is null) return null;

        ReckonedArrival? closest = null;

        foreach (var key in call.TripKeys)
        {
            if (!fleetByTrip.TryGetValue(Vehicles.VehicleMatcher.BareTripId(key), out var bus)) continue;
            if (EstimatedFromBus(call, bus) is not { } estimated) continue;

            var off = estimated - call.ScheduledUnix;

            if (!NearItsDeparture(estimated, call.ScheduledUnix)) continue;
            if (closest is not null && Math.Abs(off) >= Math.Abs(closest.OffScheduleSeconds)) continue;

            closest = new ReckonedArrival(bus, estimated, off);
        }

        return closest;
    }

    public static bool NearItsDeparture(long estimatedUnix, long scheduledUnix) =>
        Math.Abs(estimatedUnix - scheduledUnix) <= (long)FarthestFromTheSchedule.TotalSeconds;

    public static bool Within(long unix, long nowUnix, TimeSpan behind, TimeSpan ahead) =>
        unix >= nowUnix - (long)behind.TotalSeconds && unix <= nowUnix + (long)ahead.TotalSeconds;

    public static long? EstimatedFromBus(ScheduledCall call, Vehicles.RunningBus? bus)
    {
        if (bus?.AtStopId is not { } atStopId || bus.ReportedAtUnix <= 0) return null;

        var there = call.Schedule.FirstOrDefault(stop => stop.StopId == atStopId);
        var here = call.Schedule.FirstOrDefault(stop => stop.StopSequence == call.StopSequence);

        if (there is null || here is null) return null;

        if (ScheduleReader.SecondsIntoDay(there.ArrivalTime) is not { } left) return null;
        if (ScheduleReader.SecondsIntoDay(here.ArrivalTime) is not { } arrives) return null;

        return bus.ReportedAtUnix + (arrives - left);
    }

    public static bool HasNotGoneBy(ScheduledCall call, Vehicles.RunningBus? bus)
    {
        if (bus?.AtStopId is not { } atStopId) return false;

        var at = call.Schedule.FirstOrDefault(stop => stop.StopId == atStopId);

        return at is not null && at.StopSequence <= call.StopSequence;
    }

    private static LiveEta? Matching(
        IReadOnlyDictionary<string, LiveEta> byTrip, IReadOnlyList<string> tripKeys)
    {
        foreach (var key in tripKeys)
        {
            if (byTrip.TryGetValue(key, out var eta)) return eta;
        }

        return null;
    }
}
