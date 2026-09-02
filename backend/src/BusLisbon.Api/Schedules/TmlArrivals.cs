using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace BusLisbon.Api.Schedules;

public sealed class TmlArrival
{
    [JsonPropertyName("trip_id")]
    public string TripId { get; set; } = string.Empty;

    [JsonPropertyName("eta_at")]
    public double? EtaAt { get; set; }

    [JsonPropertyName("vehicle_id")]
    public string? VehicleId { get; set; }
}

public sealed record TripParts(string LineId, string PatternId, string AgencyPatternId);

public sealed record ApproachingTrip(string TripId, string PatternId, string LineId, string VehicleId, long EtaUnix);

public interface ITmlArrivals
{
    Task<Dictionary<string, ApproachingTrip>> GetApproachingAsync(
        string stopId, CancellationToken cancellationToken);
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

    public static long? EstimatedUnix(double? etaAt) =>
        etaAt is { } milliseconds && double.IsFinite(milliseconds) && milliseconds > 0
            ? (long)Math.Round(milliseconds / 1000)
            : null;

    private async Task<TmlEnvelope<List<TmlArrival>>?> ReadEnvelopeAsync(
        string stopId, CancellationToken cancellationToken)
    {
        using var answer = await http.GetAsync(
            $"/hub/api/v1/realtime/eta/by-stop/{Uri.EscapeDataString(stopId)}", cancellationToken);

        answer.EnsureSuccessStatusCode();

        if (answer.Content.Headers.ContentLength is 0) return null;

        var body = await answer.Content.ReadAsStringAsync(cancellationToken);

        return string.IsNullOrWhiteSpace(body)
            ? null
            : JsonSerializer.Deserialize<TmlEnvelope<List<TmlArrival>>>(body, SerializerOptions);
    }

    public async Task<Dictionary<string, ApproachingTrip>> GetApproachingAsync(
        string stopId, CancellationToken cancellationToken)
    {
        var envelope = await ReadEnvelopeAsync(stopId, cancellationToken);

        var approaching = new Dictionary<string, ApproachingTrip>();

        foreach (var arrival in envelope?.Data ?? [])
        {
            var trip = ReadTripId(arrival.TripId);

            if (trip is null) continue;
            if (EstimatedUnix(arrival.EtaAt) is not { } estimated) continue;

            approaching[arrival.TripId] = new ApproachingTrip(
                arrival.TripId, trip.AgencyPatternId, trip.LineId, arrival.VehicleId ?? string.Empty,
                estimated);
        }

        return approaching;
    }
}
