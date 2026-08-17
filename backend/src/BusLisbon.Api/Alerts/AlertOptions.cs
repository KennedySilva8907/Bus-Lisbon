namespace BusLisbon.Api.Alerts;

public sealed class AlertOptions
{
    public const string SectionName = "Alerts";

    public TimeSpan CheckInterval { get; set; } = TimeSpan.FromMinutes(2);

    public int MaxMisses { get; set; } = 5;
}
