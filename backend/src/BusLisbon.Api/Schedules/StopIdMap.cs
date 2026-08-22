using System.Globalization;
using System.Reflection;
using System.Text.Json;

namespace BusLisbon.Api.Schedules;

public static class StopIdMap
{
    private const string ResourceName = "BusLisbon.Api.Schedules.stop-id-map.json";

    private static readonly Lazy<IReadOnlyDictionary<string, string>> Loaded = new(Read);

    public static IReadOnlyDictionary<string, string> All => Loaded.Value;

    public static string? NetworkIdFor(string stopId) =>
        All.TryGetValue(stopId, out var networkId) ? networkId : null;

    private static IReadOnlyDictionary<string, string> Read()
    {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(ResourceName)
            ?? throw new InvalidOperationException($"{ResourceName} is not embedded in the assembly");

        var pairs = JsonSerializer.Deserialize<Dictionary<string, long>>(stream)
            ?? throw new InvalidOperationException($"{ResourceName} did not contain a mapping");

        return pairs.ToDictionary(
            pair => pair.Key,
            pair => pair.Value.ToString(CultureInfo.InvariantCulture));
    }
}
