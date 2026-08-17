namespace BusLisbon.Api.Alerts;

public sealed class VapidOptions
{
    public const string SectionName = "Vapid";

    public string PublicKey { get; set; } = string.Empty;

    public string PrivateKey { get; set; } = string.Empty;

    public string Subject { get; set; } = "mailto:noreply@bus-lisbon.local";

    public bool IsConfigured => PublicKey.Length > 0 && PrivateKey.Length > 0;
}
