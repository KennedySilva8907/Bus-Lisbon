using System.Text.Json;
using System.Text.Json.Serialization;

namespace BusLisbon.Api.Carris;

public sealed class UnixSeconds : JsonConverter<long?>
{
    public const long SmallestMillisecondReading = 100_000_000_000;

    public override long? Read(ref Utf8JsonReader reader, Type type, JsonSerializerOptions options)
    {
        var raw = reader.TokenType switch
        {
            JsonTokenType.Null => (long?)null,
            JsonTokenType.Number => reader.TryGetInt64(out var whole) ? whole : (long)reader.GetDouble(),
            JsonTokenType.String => long.TryParse(reader.GetString(), out var parsed) ? parsed : null,
            _ => throw new JsonException($"Cannot read a {reader.TokenType} as a report time"),
        };

        return raw is { } seconds && Math.Abs(seconds) >= SmallestMillisecondReading
            ? seconds / 1000
            : raw;
    }

    public override void Write(Utf8JsonWriter writer, long? value, JsonSerializerOptions options)
    {
        if (value is { } seconds) writer.WriteNumberValue(seconds);
        else writer.WriteNullValue();
    }
}
