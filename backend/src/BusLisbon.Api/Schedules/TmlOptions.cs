namespace BusLisbon.Api.Schedules;

public sealed class TmlOptions
{
    public const string SectionName = "Tml";

    public string BaseUrl { get; set; } = "https://go.tmlmobilidade.pt";

    public TimeSpan NetworkLifetime { get; set; } = TimeSpan.FromHours(12);

    public string TimeZone { get; set; } = "Europe/Lisbon";
}
