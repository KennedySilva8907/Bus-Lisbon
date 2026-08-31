using System.Globalization;
using BusLisbon.Api.Alerts;

namespace BusLisbon.Api.Observations;

public sealed record PendingObservations(
    IReadOnlyList<string> Batches, IReadOnlyList<ArrivalObservation> Passages);

public sealed class ObservationBuffer(IKeyValueStore store, TimeProvider clock)
{
    public const string BatchesKey = "observations:pending";
    public const string LastAttemptKey = "observations:last-attempt";

    public static readonly TimeSpan BetweenWrites = TimeSpan.FromHours(20);

    public static string BatchKey(string batch) => $"{BatchesKey}:{batch}";

    public async Task KeepAsync(
        IReadOnlyList<ArrivalObservation> passages, CancellationToken cancellationToken)
    {
        if (passages.Count == 0) return;

        var batch = clock.GetUtcNow().ToUnixTimeSeconds().ToString(CultureInfo.InvariantCulture);

        await store.SetAsync(BatchKey(batch), passages, expiry: null, cancellationToken);
        await store.SetAddAsync(BatchesKey, batch, cancellationToken);
    }

    public async Task<PendingObservations> PendingAsync(CancellationToken cancellationToken)
    {
        var batches = await store.SetMembersAsync(BatchesKey, cancellationToken);
        var passages = new List<ArrivalObservation>();

        foreach (var batch in batches)
        {
            var kept = await store.GetAsync<List<ArrivalObservation>>(
                BatchKey(batch), cancellationToken);

            if (kept is not null) passages.AddRange(kept);
        }

        return new PendingObservations(batches, FirstSighting(passages));
    }

    public async Task ForgetAsync(IReadOnlyList<string> batches, CancellationToken cancellationToken)
    {
        foreach (var batch in batches)
        {
            await store.DeleteAsync(BatchKey(batch), cancellationToken);
            await store.SetRemoveAsync(BatchesKey, batch, cancellationToken);
        }
    }

    public static IReadOnlyList<ArrivalObservation> FirstSighting(
        IReadOnlyList<ArrivalObservation> passages)
    {
        var byDeparture = new Dictionary<(string, string, long), ArrivalObservation>();

        foreach (var passage in passages)
        {
            var key = (passage.StopId, passage.LineId, passage.ScheduledUnix);

            if (!byDeparture.TryGetValue(key, out var kept) || passage.ObservedUnix < kept.ObservedUnix)
            {
                byDeparture[key] = passage;
            }
        }

        return [.. byDeparture.Values];
    }

    public async Task<bool> DueForWritingAsync(CancellationToken cancellationToken)
    {
        var last = await store.GetAsync<long?>(LastAttemptKey, cancellationToken);

        if (last is not { } attempted) return true;

        return clock.GetUtcNow().ToUnixTimeSeconds() - attempted >= (long)BetweenWrites.TotalSeconds;
    }

    public Task AttemptedAsync(CancellationToken cancellationToken) =>
        store.SetAsync(
            LastAttemptKey, clock.GetUtcNow().ToUnixTimeSeconds(), expiry: null, cancellationToken);
}
