using System.Text.Json;
using System.Text.Json.Serialization;

namespace BusLisbon.Api.Alerts;

public sealed record AlertPushPayload(
    string Title,
    string Body,
    string Tag,
    string StopId,
    string VehicleId,
    string LineId,
    string PatternId,
    string Url);

public enum PushResult
{
    Sent,
    SubscriptionGone,
    Failed
}

public static class AlertPush
{
    private static readonly JsonSerializerOptions Payload = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.Never
    };

    public static AlertPushPayload PayloadFor(Alert alert, int minutesToShow) => new(
        $"🚌 {alert.LineId}",
        $"Chega à {alert.StopName} em ~{minutesToShow} min",
        $"bus-{alert.VehicleId}-{alert.StopId}",
        alert.StopId,
        alert.VehicleId,
        alert.LineId,
        alert.PatternId,
        $"/?stop={alert.StopId}&vehicle={alert.VehicleId}&pattern={alert.PatternId}&line={alert.LineId}");

    public static string Serialize(AlertPushPayload payload) =>
        JsonSerializer.Serialize(payload, Payload);
}
