using BusLisbon.Api.Carris;
using BusLisbon.Api.Vehicles;

namespace BusLisbon.Api.Tests;

public class VehicleFilterTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.FromUnixTimeSeconds(1_786_010_000);

    private static CarrisVehicle Live(string id = "41|300", double? lat = 38.7856, double? lon = -9.3037, long? timestamp = 1_786_009_950) =>
        new()
        {
            Id = id,
            Lat = lat,
            Lon = lon,
            LineId = "1209",
            PatternId = "1209_1_1",
            TripId = "[XS3H8]1209_1_1_1000_1029_0_7",
            Bearing = 302,
            Speed = 8.05,
            Timestamp = timestamp
        };

    [Fact]
    public void IsLive_AcceptsAVehicleWithFreshCoordinates()
    {
        Assert.True(VehicleFilter.IsLive(Live(), Now));
    }

    [Fact]
    public void IsLive_RejectsTheMalformedUndefinedRow()
    {
        Assert.False(VehicleFilter.IsLive(Live(id: "|undefined", lat: null, lon: null, timestamp: null), Now));
    }

    [Theory]
    [InlineData("")]
    [InlineData(null)]
    public void IsLive_RejectsAMissingId(string? id)
    {
        Assert.False(VehicleFilter.IsLive(Live(id: id!), Now));
    }

    [Fact]
    public void IsLive_RejectsMissingCoordinates()
    {
        Assert.False(VehicleFilter.IsLive(Live(lat: null), Now));
        Assert.False(VehicleFilter.IsLive(Live(lon: null), Now));
    }

    [Fact]
    public void IsLive_RejectsNonFiniteCoordinates()
    {
        Assert.False(VehicleFilter.IsLive(Live(lat: double.NaN), Now));
        Assert.False(VehicleFilter.IsLive(Live(lon: double.PositiveInfinity), Now));
    }

    [Fact]
    public void IsLive_RejectsNullIsland()
    {
        Assert.False(VehicleFilter.IsLive(Live(lat: 0, lon: 0), Now));
    }

    [Fact]
    public void IsLive_AcceptsAFixExactlyAtTheFreshnessBoundary()
    {
        var atBoundary = Now.ToUnixTimeSeconds() - VehicleFilter.FreshWindowSeconds;

        Assert.True(VehicleFilter.IsLive(Live(timestamp: atBoundary), Now));
    }

    [Fact]
    public void IsLive_RejectsAFixOneSecondPastTheFreshnessBoundary()
    {
        var pastBoundary = Now.ToUnixTimeSeconds() - VehicleFilter.FreshWindowSeconds - 1;

        Assert.False(VehicleFilter.IsLive(Live(timestamp: pastBoundary), Now));
    }

    [Fact]
    public void IsLive_SkipsTheFreshnessCheckWhenTheTimestampIsAbsentOrZero()
    {
        Assert.True(VehicleFilter.IsLive(Live(timestamp: null), Now));
        Assert.True(VehicleFilter.IsLive(Live(timestamp: 0), Now));
    }

    [Fact]
    public void From_ProjectsOnlyTheFieldsTheClientNeeds()
    {
        var vehicle = Vehicle.From(Live());

        Assert.Equal("41|300", vehicle.Id);
        Assert.Equal(38.7856, vehicle.Lat);
        Assert.Equal(-9.3037, vehicle.Lon);
        Assert.Equal("1209", vehicle.LineId);
        Assert.Equal("1209_1_1", vehicle.PatternId);
        Assert.Equal("[XS3H8]1209_1_1_1000_1029_0_7", vehicle.TripId);
        Assert.Equal(302, vehicle.Bearing);
        Assert.Equal(8.05, vehicle.Speed);
        Assert.Equal(1_786_009_950, vehicle.Timestamp);
    }
}
