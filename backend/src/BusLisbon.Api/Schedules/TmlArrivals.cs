using System.Globalization;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace BusLisbon.Api.Schedules;

public sealed class TmlArrival
{
    [JsonPropertyName("trip_id")]
    public string TripId { get; set; } = string.Empty;

    [JsonPropertyName("eta_seconds")]
    public string? EtaSeconds { get; set; }
}

public sealed record TripParts(string LineId, string PatternId, string AgencyPatternId);

public interface ITmlArrivals
{
    Task<Dictionary<string, ApproachingTrip>> GetApproachingAsync(
        string stopId, long nowUnix, CancellationToken cancellationToken);
}

public sealed partial class TmlArrivalsClient(HttpClient http) : ITmlArrivals
{
    private static readonly JsonSerializerOptions SerializerOptions = new()
    {
        NumberHandling = JsonNumberHandling.AllowReadingFromString
    };

    [GeneratedRegex(@"^(?:\[[^\]]+\])+")]
    private static partial Regex Agencies();

    public static TripParts? ReadTripId(string tripId)
    {
        if (string.IsNullOrEmpty(tripId)) return null;

        var prefix = Agencies().Match(tripId).Value;
        var agency = Regex.Matches(prefix, @"\[[^\]]+\]").LastOrDefault()?.Value ?? string.Empty;
        var body = tripId[prefix.Length..].Split('|')[0];
        var parts = body.Split('_');

        if (parts.Length < 3) return null;

        var patternId = string.Join('_', parts.Take(3));

        return Regex.IsMatch(patternId, @"^\d+_\d+_\d+$")
            ? new TripParts(parts[0], patternId, agency + patternId)
            : null;
    }

    public async Task<Dictionary<string, ApproachingTrip>> GetApproachingAsync(
        string stopId, long nowUnix, CancellationToken cancellationToken)
    {
        var envelope = await http.GetFromJsonAsync<TmlEnvelope<List<TmlArrival>>>(
            $"/hub/api/v1/realtime/eta/by-stop/{Uri.EscapeDataString(stopId)}",
            SerializerOptions,
            cancellationToken);

        var approaching = new Dictionary<string, ApproachingTrip>();

        foreach (var arrival in envelope?.Data ?? [])
        {
            var trip = ReadTripId(arrival.TripId);

            if (trip is null) continue;
            if (!long.TryParse(arrival.EtaSeconds, NumberStyles.Integer, CultureInfo.InvariantCulture, out var seconds))
            {
                continue;
            }

            approaching[arrival.TripId] = new ApproachingTrip(
                arrival.TripId, trip.AgencyPatternId, trip.LineId, nowUnix + seconds);
        }

        return approaching;
    }
}
