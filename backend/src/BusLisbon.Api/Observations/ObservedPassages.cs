using BusLisbon.Api.Carris;

namespace BusLisbon.Api.Observations;

public static class ObservedPassages
{
    public static IReadOnlyList<ArrivalObservation> From(
        string stopId, IReadOnlyList<CarrisArrival> arrivals, TimeZoneInfo zone)
    {
        var seen = new HashSet<(string, long)>();
        var passages = new List<ArrivalObservation>();

        foreach (var arrival in arrivals)
        {
            if (arrival.ObservedArrivalUnix is not { } observed
                || arrival.ScheduledArrivalUnix is not { } scheduled
                || string.IsNullOrEmpty(arrival.LineId))
            {
                continue;
            }

            if (!seen.Add((arrival.LineId, scheduled)))
            {
                continue;
            }

            passages.Add(new ArrivalObservation
            {
                LineId = arrival.LineId,
                StopId = stopId,
                PatternId = arrival.PatternId,
                ServiceDate = ServiceDateOf(scheduled, zone),
                ScheduledUnix = scheduled,
                EstimatedUnix = Predicted(arrival.EstimatedArrivalUnix, scheduled),
                ObservedUnix = observed,
            });
        }

        return passages;
    }

    private static long? Predicted(long? estimated, long scheduled) =>
        estimated is { } value && value != scheduled ? value : null;

    private static DateOnly ServiceDateOf(long scheduledUnix, TimeZoneInfo zone) =>
        DateOnly.FromDateTime(
            TimeZoneInfo.ConvertTime(DateTimeOffset.FromUnixTimeSeconds(scheduledUnix), zone).DateTime);
}
