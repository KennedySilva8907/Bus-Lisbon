namespace BusLisbon.Api.Schedules;

public sealed record ApproachingTrip(string TripId, string PatternId, string LineId, long EtaUnix);

public sealed record ObservedPassage(
    string TripId,
    string PatternId,
    string LineId,
    string Headsign,
    long ObservedUnix,
    long ScheduledUnix);

public static class PassageDetector
{
    public const long ArrivingWithinSeconds = 150;

    public static IReadOnlyList<ApproachingTrip> Passed(
        IReadOnlyDictionary<string, ApproachingTrip> before,
        IReadOnlyDictionary<string, ApproachingTrip> after,
        long nowUnix)
    {
        var gone = new List<ApproachingTrip>();

        foreach (var (tripId, trip) in before)
        {
            if (after.ContainsKey(tripId)) continue;
            if (trip.EtaUnix > nowUnix + ArrivingWithinSeconds) continue;

            gone.Add(trip);
        }

        return gone;
    }

    public static bool WorthKeeping(long observedUnix, long nowUnix, TimeSpan window) =>
        observedUnix > nowUnix - (long)window.TotalSeconds && observedUnix <= nowUnix;
}
