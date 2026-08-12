using BusLisbon.Api.Realtime;

namespace BusLisbon.Api.Tests;

public class VehicleTargetTests
{
    [Fact]
    public void Group_ForAVehicleUsesTheVehicleId()
    {
        var target = new VehicleTarget("41|300", null, null);

        Assert.Equal("vehicle:41|300", target.Group);
    }

    [Fact]
    public void Group_ForALineWithoutAPatternUsesAWildcard()
    {
        var target = new VehicleTarget(null, "1209", null);

        Assert.Equal("line:1209|*", target.Group);
    }

    [Fact]
    public void Group_ForALineWithAPatternIncludesIt()
    {
        var target = new VehicleTarget(null, "1209", "1209_1_1");

        Assert.Equal("line:1209|1209_1_1", target.Group);
    }

    [Fact]
    public void Group_TellsTwoPatternsOnTheSameLineApart()
    {
        var first = new VehicleTarget(null, "1209", "1209_1_1");
        var second = new VehicleTarget(null, "1209", "1209_0_2");

        Assert.NotEqual(first.Group, second.Group);
    }
}
