using System.Collections.Concurrent;

namespace BusLisbon.Api.Schedules;

public sealed class PassageLog(TimeProvider clock)
{
    public static readonly TimeSpan Window = TimeSpan.FromHours(2);

    public static readonly TimeSpan WatchFor = TimeSpan.FromMinutes(20);

    private readonly ConcurrentDictionary<string, List<ObservedPassage>> passages = new();
    private readonly ConcurrentDictionary<string, DateTimeOffset> asked = new();
    private readonly ConcurrentDictionary<string, Dictionary<string, ApproachingTrip>> lastSeen = new();

    public void Wanted(string stopId) => asked[stopId] = clock.GetUtcNow();

    public IReadOnlyList<string> Watching()
    {
        var cutoff = clock.GetUtcNow() - WatchFor;

        foreach (var (stopId, when) in asked)
        {
            if (when < cutoff) asked.TryRemove(stopId, out _);
        }

        return [.. asked.Keys];
    }

    public IReadOnlyDictionary<string, ApproachingTrip> LastSeenAt(string stopId) =>
        lastSeen.TryGetValue(stopId, out var trips) ? trips : new Dictionary<string, ApproachingTrip>();

    public void Remember(string stopId, Dictionary<string, ApproachingTrip> trips) => lastSeen[stopId] = trips;

    public void Record(string stopId, IEnumerable<ObservedPassage> observed)
    {
        var now = clock.GetUtcNow().ToUnixTimeSeconds();
        var kept = passages.GetOrAdd(stopId, _ => []);

        lock (kept)
        {
            foreach (var passage in observed)
            {
                if (kept.Any(existing => existing.TripId == passage.TripId)) continue;

                kept.Add(passage);
            }

            kept.RemoveAll(passage => !PassageDetector.WorthKeeping(passage.ObservedUnix, now, Window));
        }
    }

    public IReadOnlyList<ObservedPassage> At(string stopId)
    {
        if (!passages.TryGetValue(stopId, out var kept)) return [];

        lock (kept)
        {
            return [.. kept.OrderByDescending(passage => passage.ObservedUnix)];
        }
    }
}
