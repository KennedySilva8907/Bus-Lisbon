using System.Text.Json.Serialization;

namespace BusLisbon.Api.Carris;

public sealed record CarrisVehicle
{
    [JsonPropertyName("id")]
    public string? Id { get; init; }

    [JsonPropertyName("lat")]
    public double? Lat { get; init; }

    [JsonPropertyName("lon")]
    public double? Lon { get; init; }

    [JsonPropertyName("line_id")]
    public string? LineId { get; init; }

    [JsonPropertyName("pattern_id")]
    public string? PatternId { get; init; }

    [JsonPropertyName("trip_id")]
    public string? TripId { get; init; }

    [JsonPropertyName("bearing")]
    public double? Bearing { get; init; }

    [JsonPropertyName("speed")]
    public double? Speed { get; init; }

    [JsonPropertyName("current_status")]
    public string? CurrentStatus { get; init; }

    [JsonPropertyName("stop_id")]
    public string? StopId { get; init; }

    [JsonPropertyName("timestamp")]
    public long? Timestamp { get; init; }
}
