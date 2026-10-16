using System.Text.Json.Serialization;
using BusLisbon.Api.Schedules;

namespace BusLisbon.Api.Carris;

public interface ICarrisRoutes
{
    Task<CarrisRoute?> GetRouteAsync(string patternId, CancellationToken cancellationToken);
}

public sealed record CarrisRoute(IReadOnlyList<Place> Shape, IReadOnlyList<Place> Stops);

public sealed class CarrisPattern
{
    [JsonPropertyName("shape_id")]
    public string? ShapeId { get; set; }

    [JsonPropertyName("path")]
    public List<CarrisPathEntry> Path { get; set; } = [];
}

public sealed class CarrisPathEntry
{
    [JsonPropertyName("stop")]
    public CarrisPathStop? Stop { get; set; }
}

public sealed class CarrisPathStop
{
    [JsonPropertyName("lat")]
    [JsonConverter(typeof(TextOrNumber))]
    public string? Lat { get; set; }

    [JsonPropertyName("lon")]
    [JsonConverter(typeof(TextOrNumber))]
    public string? Lon { get; set; }
}

public sealed class CarrisShape
{
    [JsonPropertyName("geojson")]
    public CarrisGeoJson? GeoJson { get; set; }
}

public sealed class CarrisGeoJson
{
    [JsonPropertyName("geometry")]
    public CarrisGeometry? Geometry { get; set; }
}

public sealed class CarrisGeometry
{
    [JsonPropertyName("coordinates")]
    public List<List<double>> Coordinates { get; set; } = [];
}
