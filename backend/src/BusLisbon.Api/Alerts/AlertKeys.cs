namespace BusLisbon.Api.Alerts;

public static class AlertKeys
{
    public const string Pending = "pending_alerts";

    public static string Alert(string id) => $"alert:{id}";

    public static string EndpointAlerts(string endpoint) => $"endpoint_alerts:{endpoint}";

    public static string Subscription(string endpoint) => $"subscription:{endpoint}";
}
