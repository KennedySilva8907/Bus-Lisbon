using BusLisbon.Api.Schedules;

namespace BusLisbon.Api.Tests;

public class RouteShapeTests
{
    private static readonly Place[] NorthboundStreet =
        [new(38.750, -9.150), new(38.760, -9.150)];

    private static readonly Place MidStreetStop = new(38.755, -9.15003);

    private static readonly Place[] UpLoopAndBackDown =
    [
        new(38.750, -9.1500),
        new(38.760, -9.1500),
        new(38.760, -9.1495),
        new(38.750, -9.1495),
    ];

    private static readonly Place StopOnTheWayDown = new(38.7552, -9.14955);

    [Fact]
    public void ABusFurtherUpTheStreetHasLeftTheStop()
    {
        var shape = new RouteShape(NorthboundStreet, [MidStreetStop]);

        Assert.True(shape.HasLeft(MidStreetStop, new Place(38.757, -9.15002)));
    }

    [Fact]
    public void ABusStillBeforeTheStopHasNotLeftIt()
    {
        var shape = new RouteShape(NorthboundStreet, [MidStreetStop]);

        Assert.False(shape.HasLeft(MidStreetStop, new Place(38.753, -9.15002)));
    }

    [Fact]
    public void ABusFarFromTheRouteIsNotCalledGone()
    {
        var shape = new RouteShape(NorthboundStreet, [MidStreetStop]);

        Assert.False(shape.HasLeft(MidStreetStop, new Place(38.757, -9.1470)));
    }

    [Fact]
    public void ABusOnTheParallelRoadBeforeTheLoopIsStillComing()
    {
        var shape = new RouteShape(UpLoopAndBackDown, [new Place(38.750, -9.1500), StopOnTheWayDown]);

        Assert.False(shape.HasLeft(StopOnTheWayDown, new Place(38.7535, -9.15003)));
    }

    [Fact]
    public void ABusOnTheWayDownPastTheStopHasLeft()
    {
        var shape = new RouteShape(UpLoopAndBackDown, [new Place(38.750, -9.1500), StopOnTheWayDown]);

        Assert.True(shape.HasLeft(StopOnTheWayDown, new Place(38.7525, -9.14952)));
    }

    [Fact]
    public void DropsTheAgencyPrefixFromAPatternId()
    {
        Assert.Equal("2812_0_2", ShapeCatalogue.CarrisPatternId("[BNA17]2812_0_2"));
        Assert.Equal("3546_0_2", ShapeCatalogue.CarrisPatternId("[PL3CL][YA15B]3546_0_2"));
        Assert.Equal("2812_0_2", ShapeCatalogue.CarrisPatternId("2812_0_2"));
    }
}
