namespace BusLisbon.Api.Alerts;

public sealed class UpstashOptions
{
    public const string SectionName = "Upstash";

    public string RestUrl { get; set; } = string.Empty;

    public string RestToken { get; set; } = string.Empty;

    public bool IsConfigured => RestUrl.Length > 0 && RestToken.Length > 0;
}
