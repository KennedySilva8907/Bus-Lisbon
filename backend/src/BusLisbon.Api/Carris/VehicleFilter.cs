namespace BusLisbon.Api.Carris;

public static class VehicleFilter
{
    public const int FreshWindowSeconds = 300;

    private const string MalformedId = "|undefined";

    public static bool IsLive(CarrisVehicle vehicle, DateTimeOffset now)
    {
        if (string.IsNullOrEmpty(vehicle.Id) || vehicle.Id == MalformedId)
        {
            return false;
        }

        if (vehicle.Lat is not { } lat || vehicle.Lon is not { } lon)
        {
            return false;
        }

        if (!double.IsFinite(lat) || !double.IsFinite(lon))
        {
            return false;
        }

        if (lat == 0 && lon == 0)
        {
            return false;
        }

        if (vehicle.Timestamp is { } timestamp
            && timestamp != 0
            && now.ToUnixTimeSeconds() - timestamp > FreshWindowSeconds)
        {
            return false;
        }

        return true;
    }
}
