namespace BusLisbon.Api.Schedules;

public sealed record BoardEntry(
    string LineId,
    string PatternId,
    string Headsign,
    string TripId,
    long ScheduledUnix,
    long EstimatedUnix,
    long EffectiveUnix,
    bool IsPast,
    bool IsRealtime);

public sealed record LiveEta(string TripId, string PatternId, long EstimatedUnix);

public static class StopBoard
{
    public static IReadOnlyList<BoardEntry> Build(
        IReadOnlyList<ScheduledCall> timetable,
        IReadOnlyList<LiveEta> etas,
        long nowUnix,
        TimeSpan behind,
        TimeSpan ahead)
    {
        var byDeparture = new Dictionary<string, LiveEta>();

        foreach (var eta in etas)
        {
            byDeparture[Key(eta.PatternId, ScheduleReader.DepartureTag(eta.TripId))] = eta;
        }

        var board = new List<BoardEntry>();

        foreach (var call in timetable)
        {
            if (call.IsLastStop) continue;

            byDeparture.TryGetValue(Key(call.PatternId, call.Departure), out var eta);

            var estimated = eta?.EstimatedUnix ?? 0;
            var effective = estimated != 0 ? estimated : call.ScheduledUnix;

            if (effective < nowUnix - (long)behind.TotalSeconds) continue;
            if (effective > nowUnix + (long)ahead.TotalSeconds) continue;

            board.Add(new BoardEntry(
                call.LineId,
                call.PatternId,
                call.Headsign,
                eta?.TripId ?? string.Empty,
                call.ScheduledUnix,
                estimated,
                effective,
                effective < nowUnix,
                estimated != 0));
        }

        return [.. board.OrderBy(entry => entry.EffectiveUnix)];
    }

    private static string Key(string patternId, string departure) => $"{patternId}|{departure}";
}
