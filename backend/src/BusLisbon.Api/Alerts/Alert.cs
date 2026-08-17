using System.Text.Json;
using System.Text.Json.Serialization;

namespace BusLisbon.Api.Alerts;

public sealed class AlertStatusConverter()
    : JsonStringEnumConverter<AlertStatus>(JsonNamingPolicy.CamelCase);

[JsonConverter(typeof(AlertStatusConverter))]
public enum AlertStatus
{
    Pending,
    Fired,
    Expired,
    Cancelled
}

public sealed record Alert(
    string Id,
    string Endpoint,
    string VehicleId,
    string LineId,
    string PatternId,
    string StopId,
    string StopName,
    int ThresholdMinutes,
    long CreatedAt,
    AlertStatus Status,
    int? MissCount = null)
{
    public bool IsPending => Status == AlertStatus.Pending;

    public bool Matches(string vehicleId, string stopId, int thresholdMinutes) =>
        VehicleId == vehicleId && StopId == stopId && ThresholdMinutes == thresholdMinutes;
}

public sealed record PushSubscription(string Endpoint, PushSubscriptionKeys Keys);

public sealed record PushSubscriptionKeys(string P256dh, string Auth);
