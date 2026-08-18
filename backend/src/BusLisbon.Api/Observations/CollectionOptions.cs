namespace BusLisbon.Api.Observations;

public sealed class CollectionOptions
{
    public const string SectionName = "Collection";

    public string TimeZone { get; set; } = "Europe/Lisbon";

    public int BatchSize { get; set; } = 500;
}
