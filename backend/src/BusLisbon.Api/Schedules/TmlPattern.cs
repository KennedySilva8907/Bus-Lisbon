using System.Text.Json.Serialization;

namespace BusLisbon.Api.Schedules;

public sealed class TmlPattern
{
    [JsonPropertyName("_id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("line_id")]
    public string LineId { get; set; } = string.Empty;

    [JsonPropertyName("headsign")]
    public string Headsign { get; set; } = string.Empty;

    [JsonPropertyName("trips")]
    public List<TmlTripGroup> Trips { get; set; } = [];
}

public sealed class TmlTripGroup
{
    [JsonPropertyName("schedule")]
    public List<TmlScheduleEntry> Schedule { get; set; } = [];

    [JsonPropertyName("trip_ids")]
    public List<string> TripIds { get; set; } = [];

    [JsonPropertyName("valid_on")]
    public List<string> ValidOn { get; set; } = [];
}

public sealed class TmlScheduleEntry
{
    [JsonPropertyName("arrival_time")]
    public string ArrivalTime { get; set; } = string.Empty;

    [JsonPropertyName("stop_id")]
    public string StopId { get; set; } = string.Empty;

    [JsonPropertyName("stop_sequence")]
    public int StopSequence { get; set; }
}

public sealed record ScheduledCall(
    string LineId,
    string PatternId,
    string Headsign,
    string Departure,
    long ScheduledUnix,
    bool IsLastStop);
