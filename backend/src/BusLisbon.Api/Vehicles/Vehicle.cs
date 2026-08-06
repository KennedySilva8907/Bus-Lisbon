using BusLisbon.Api.Carris;

namespace BusLisbon.Api.Vehicles;

public sealed record Vehicle(
    string Id,
    double Lat,
    double Lon,
    string? LineId,
    string? PatternId,
    string? TripId,
    double? Bearing,
    double? Speed,
    long? Timestamp)
{
    public static Vehicle From(CarrisVehicle vehicle) => new(
        vehicle.Id!,
        vehicle.Lat!.Value,
        vehicle.Lon!.Value,
        vehicle.LineId,
        vehicle.PatternId,
        vehicle.TripId,
        vehicle.Bearing,
        vehicle.Speed,
        vehicle.Timestamp);
}
