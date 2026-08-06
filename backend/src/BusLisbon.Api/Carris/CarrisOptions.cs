namespace BusLisbon.Api.Carris;

public sealed class CarrisOptions
{
    public const string SectionName = "Carris";

    public string BaseUrl { get; set; } = "https://api.carrismetropolitana.pt";

    public TimeSpan PollInterval { get; set; } = TimeSpan.FromSeconds(8);

    public TimeSpan DemandWindow { get; set; } = TimeSpan.FromSeconds(60);
}
