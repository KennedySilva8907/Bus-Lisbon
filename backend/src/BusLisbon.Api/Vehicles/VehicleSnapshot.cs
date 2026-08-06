namespace BusLisbon.Api.Vehicles;

public sealed record VehicleSnapshot(
    IReadOnlyDictionary<string, Vehicle> ById,
    IReadOnlyList<Vehicle> All,
    DateTimeOffset FetchedAt)
{
    public static VehicleSnapshot From(IEnumerable<Vehicle> vehicles, DateTimeOffset fetchedAt)
    {
        var all = vehicles.ToArray();

        return new VehicleSnapshot(
            all.GroupBy(vehicle => vehicle.Id).ToDictionary(group => group.Key, group => group.First()),
            all,
            fetchedAt);
    }
}
