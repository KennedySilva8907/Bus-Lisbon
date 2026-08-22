using System.Collections.Concurrent;
using System.Globalization;
using Microsoft.Extensions.Options;

namespace BusLisbon.Api.Schedules;

public sealed class PatternCatalogue(
    IServiceScopeFactory scopes, IOptions<TmlOptions> options, TimeProvider clock)
{
    private readonly ConcurrentDictionary<string, IReadOnlyList<TmlPattern>> patterns = new();
    private readonly SemaphoreSlim gate = new(1, 1);

    private IReadOnlyDictionary<string, IReadOnlyList<string>> stops =
        new Dictionary<string, IReadOnlyList<string>>();

    private DateTimeOffset stopsLoadedAt = DateTimeOffset.MinValue;

    public async Task<string?> NetworkStopIdAsync(string stopId, CancellationToken cancellationToken)
    {
        await EnsureStopsAsync(cancellationToken);

        if (stops.ContainsKey(stopId)) return stopId;

        var mapped = StopIdMap.NetworkIdFor(stopId);

        return mapped is not null && stops.ContainsKey(mapped) ? mapped : null;
    }

    public async Task<IReadOnlyList<string>> PatternIdsForAsync(
        string stopId, CancellationToken cancellationToken)
    {
        await EnsureStopsAsync(cancellationToken);

        return stops.TryGetValue(stopId, out var ids) ? ids : [];
    }

    public async Task<IReadOnlyList<TmlPattern>> PatternAsync(
        string patternId, CancellationToken cancellationToken)
    {
        if (patterns.TryGetValue(patternId, out var known)) return known;

        using var scope = scopes.CreateScope();
        var network = scope.ServiceProvider.GetRequiredService<ITmlNetwork>();
        var plans = await network.GetPatternAsync(patternId, cancellationToken);

        patterns[patternId] = plans;

        return plans;
    }

    private async Task EnsureStopsAsync(CancellationToken cancellationToken)
    {
        if (clock.GetUtcNow() - stopsLoadedAt < options.Value.NetworkLifetime) return;

        await gate.WaitAsync(cancellationToken);

        try
        {
            if (clock.GetUtcNow() - stopsLoadedAt < options.Value.NetworkLifetime) return;

            using var scope = scopes.CreateScope();
            var network = scope.ServiceProvider.GetRequiredService<ITmlNetwork>();
            var loaded = await network.GetStopsAsync(cancellationToken);

            stops = loaded.ToDictionary(
                stop => stop.Id.ToString(CultureInfo.InvariantCulture),
                stop => (IReadOnlyList<string>)stop.PatternIds);

            stopsLoadedAt = clock.GetUtcNow();
        }
        finally
        {
            gate.Release();
        }
    }
}
