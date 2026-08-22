using BusLisbon.Api.Vehicles;

namespace BusLisbon.Api.Tests;

public class VehicleMatcherTests
{
    private static Vehicle Bus(string id, string lineId, string? tripId) =>
        new(id, 38.7, -9.1, lineId, "2769_0_1", tripId, 0, 0, 1787340000);

    [Fact]
    public void StripsTheAgenciesOffATripId()
    {
        Assert.Equal("2769_0_1|1|3|1900", VehicleMatcher.BareTripId("[0277F][BNA17]2769_0_1|1|3|1900"));
        Assert.Equal("2769_0_1|1|3|1900", VehicleMatcher.BareTripId("[0277F]2769_0_1|1|3|1900"));
    }

    [Fact]
    public void ReadsTheNumberOffAFleetId()
    {
        Assert.Equal("2600", VehicleMatcher.FleetNumber("42|2600"));
        Assert.Equal(string.Empty, VehicleMatcher.FleetNumber("2600"));
    }

    [Fact]
    public void TellsTwoBusesOfTheSameLineApartByTheirTrip()
    {
        var fleet = new[]
        {
            Bus("42|2512", "2769", "[0277F]2769_0_1|1|3|1820"),
            Bus("42|2561", "2769", "[0277F]2769_0_1|1|3|1900")
        };

        var found = VehicleMatcher.Find(fleet, "[0277F][BNA17]2769_0_1|1|3|1900", "2561", "2769");

        Assert.Equal("42|2561", found!.Id);
    }

    [Fact]
    public void FallsBackToTheNumberWhenTheTripIsNotInTheFleetYet()
    {
        var fleet = new[] { Bus("42|2561", "2769", "[0277F]2769_0_1|1|3|1830") };

        var found = VehicleMatcher.Find(fleet, "[0277F][BNA17]2769_0_1|1|3|1900", "2561", "2769");

        Assert.Equal("42|2561", found!.Id);
    }

    [Fact]
    public void UsesTheLineToSettleARepeatedNumber()
    {
        var fleet = new[]
        {
            Bus("42|2600", "2650", "[0277F]2650_0_2|1|3|1850"),
            Bus("43|2600", "1234", "[0277F]1234_0_1|1|3|1850")
        };

        var found = VehicleMatcher.Find(fleet, "[X]9999_0_1|1|3|1900", "2600", "1234");

        Assert.Equal("43|2600", found!.Id);
    }

    [Fact]
    public void RefusesToGuessWhenTheNumberIsRepeatedAndTheLineDoesNotSettleIt()
    {
        var fleet = new[]
        {
            Bus("42|2600", "2650", "[0277F]2650_0_2|1|3|1850"),
            Bus("43|2600", "2650", "[0277F]2650_0_2|1|3|1900")
        };

        Assert.Null(VehicleMatcher.Find(fleet, "[X]9999_0_1|1|3|1900", "2600", "2650"));
    }

    [Fact]
    public void GivesNothingWhenTheBusIsNotInTheFleetAtAll()
    {
        var fleet = new[] { Bus("42|2512", "2769", "[0277F]2769_0_1|1|3|1820") };

        Assert.Null(VehicleMatcher.Find(fleet, "[X]1111_0_1|1|3|1900", "9999", "1111"));
    }

    [Fact]
    public void PrefersTheTripOverTheNumberWhenBothCouldMatch()
    {
        var fleet = new[]
        {
            Bus("42|1111", "2769", "[0277F]2769_0_1|1|3|1900"),
            Bus("42|2222", "2769", "[0277F]2769_0_1|1|3|1820")
        };

        var found = VehicleMatcher.Find(fleet, "[BNA17]2769_0_1|1|3|1900", "2222", "2769");

        Assert.Equal("42|1111", found!.Id);
    }
}
