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
    bool IsRealtime);

public sealed record LiveEta(string TripId, string PatternId, string VehicleId, long EstimatedUnix);

public static class StopBoard
{
    public static IReadOnlyList<BoardEntry> Build(
        IReadOnlyList<ScheduledCall> timetable,
        IReadOnlyList<LiveEta> etas,
        long nowUnix,
        TimeSpan behind,
        TimeSpan ahead)
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

            var eta = Matching(byTrip, call.TripKeys);
            var estimated = eta?.EstimatedUnix ?? 0;
            var effective = estimated != 0 ? estimated : call.ScheduledUnix;

            if (effective < nowUnix - (long)behind.TotalSeconds) continue;
            if (effective > nowUnix + (long)ahead.TotalSeconds) continue;

            board.Add(new BoardEntry(
                call.LineId,
                call.PatternId,
                call.Headsign,
                eta?.TripId ?? string.Empty,
                eta?.VehicleId ?? string.Empty,
                call.ScheduledUnix,
                estimated,
                effective,
                effective < nowUnix,
                estimated != 0));
        }

        return [.. board.OrderBy(entry => entry.EffectiveUnix)];
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
