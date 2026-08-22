using System.Text.RegularExpressions;

namespace BusLisbon.Api.Vehicles;

public static partial class VehicleMatcher
{
    [GeneratedRegex(@"\[[^\]]+\]")]
    private static partial Regex Brackets();

    public static string BareTripId(string? tripId) =>
        string.IsNullOrEmpty(tripId) ? string.Empty : Brackets().Replace(tripId, string.Empty);

    public static string FleetNumber(string? vehicleId)
    {
        var cut = vehicleId?.IndexOf('|') ?? -1;

        return cut >= 0 ? vehicleId![(cut + 1)..] : string.Empty;
    }

    public static Vehicle? Find(
        IReadOnlyList<Vehicle> fleet, string? tripId, string? number, string? lineId)
    {
        var wantedTrip = BareTripId(tripId);

        if (wantedTrip.Length > 0)
        {
            var onTrip = fleet.FirstOrDefault(vehicle => BareTripId(vehicle.TripId) == wantedTrip);

            if (onTrip is not null) return onTrip;
        }

        if (string.IsNullOrEmpty(number)) return null;

        var sameNumber = fleet.Where(vehicle => FleetNumber(vehicle.Id) == number).ToList();

        if (sameNumber.Count == 1) return sameNumber[0];

        if (string.IsNullOrEmpty(lineId)) return null;

        var onLine = sameNumber.Where(vehicle => vehicle.LineId == lineId).ToList();

        return onLine.Count == 1 ? onLine[0] : null;
    }
}
