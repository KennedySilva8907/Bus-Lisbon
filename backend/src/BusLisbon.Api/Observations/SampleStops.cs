using System.Reflection;
using System.Text.Json;

namespace BusLisbon.Api.Observations;

public static class SampleStops
{
    private const string ResourceName = "BusLisbon.Api.Observations.sample-stops.json";

    private static readonly Lazy<IReadOnlyList<string>> Loaded = new(Read);

    public static IReadOnlyList<string> All => Loaded.Value;

    private static IReadOnlyList<string> Read()
    {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(ResourceName)
            ?? throw new InvalidOperationException($"{ResourceName} is not embedded in the assembly");

        return JsonSerializer.Deserialize<List<string>>(stream)
            ?? throw new InvalidOperationException($"{ResourceName} did not contain a list of stops");
    }
}
