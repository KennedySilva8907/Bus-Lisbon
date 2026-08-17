using System.Text.Json.Serialization;

namespace BusLisbon.Api.Carris;

public sealed record CarrisArrival
{
    [JsonPropertyName("line_id")]
    public string? LineId { get; init; }

    [JsonPropertyName("pattern_id")]
    public string? PatternId { get; init; }

    [JsonPropertyName("vehicle_id")]
    public string? VehicleId { get; init; }

    [JsonPropertyName("estimated_arrival_unix")]
    public long? EstimatedArrivalUnix { get; init; }

    [JsonPropertyName("scheduled_arrival_unix")]
    public long? ScheduledArrivalUnix { get; init; }

    [JsonPropertyName("observed_arrival_unix")]
    public long? ObservedArrivalUnix { get; init; }

    public long? ArrivalUnix => EstimatedArrivalUnix ?? ScheduledArrivalUnix;
}
