namespace BusLisbon.Api.Reliability;

public sealed class ReliabilityOptions
{
    public const string SectionName = "Reliability";

    public int MinimumPassages { get; set; } = 30;

    public int WindowDays { get; set; } = 30;

    public int ToleranceSeconds { get; set; } = 300;

    public string TimeZone { get; set; } = "Europe/Lisbon";
}
