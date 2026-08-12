namespace BusLisbon.Api.Realtime;

public sealed record VehicleTarget(string? VehicleId, string? LineId, string? PatternId)
{
    public string Group => VehicleId is { Length: > 0 }
        ? $"vehicle:{VehicleId}"
        : $"line:{LineId}|{(string.IsNullOrEmpty(PatternId) ? "*" : PatternId)}";
}
