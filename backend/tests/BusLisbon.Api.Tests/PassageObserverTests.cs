using BusLisbon.Api.Observations;
using BusLisbon.Api.Vehicles;

namespace BusLisbon.Api.Tests;

public class PassageObserverTests
{
    private const long Now = 1787340000;

    private static readonly HashSet<string> Watched = ["110785", "110591"];

    private static Vehicle Bus(
        string status = "STOPPED_AT",
        string? stopId = "110785",
        string? tripId = "[0277F]2769_0_1|2|3|1230",
        long? at = Now - 30) =>
        new("42|2548", 38.8, -9.2, "2769", "2769_0_1", tripId, 90, 0, at, stopId, status);

    [Fact]
    public void SeesABusStandingAtAWatchedStop()
    {
        var standing = PassageObserver.StandingAt([Bus()], Watched, Now);

        Assert.Single(standing);
        Assert.Equal("110785", standing[0].StopId);
        Assert.Equal("2769", standing[0].LineId);
        Assert.Equal(Now - 30, standing[0].AtUnix);
    }

    [Fact]
    public void IgnoresABusThatIsOnlyOnItsWayToTheStop()
    {
        Assert.Empty(PassageObserver.StandingAt([Bus(status: "IN_TRANSIT_TO")], Watched, Now));
        Assert.Empty(PassageObserver.StandingAt([Bus(status: "INCOMING_AT")], Watched, Now));
    }

    [Fact]
    public void IgnoresAStopNobodyIsWatching()
    {
        Assert.Empty(PassageObserver.StandingAt([Bus(stopId: "999999")], Watched, Now));
    }

    [Fact]
    public void IgnoresABusThatWillNotSayWhichTripItIsOn()
    {
        Assert.Empty(PassageObserver.StandingAt([Bus(tripId: null)], Watched, Now));
        Assert.Empty(PassageObserver.StandingAt([Bus(stopId: null)], Watched, Now));
    }

    [Fact]
    public void CountsOneBusOnceEvenAcrossPlanPrefixes()
    {
        var standing = PassageObserver.StandingAt(
            [Bus(tripId: "[0277F]2769_0_1|2|3|1230"), Bus(tripId: "[Y8LCX]2769_0_1|2|3|1230")],
            Watched,
            Now);

        Assert.Single(standing);
    }

    [Fact]
    public void UsesNowWhenTheBusDidNotStampItsPosition()
    {
        var standing = PassageObserver.StandingAt([Bus(at: null)], Watched, Now);

        Assert.Equal(Now, standing[0].AtUnix);
    }

    [Fact]
    public void SeesTheSameTripAtTwoDifferentStops()
    {
        var standing = PassageObserver.StandingAt(
            [Bus(stopId: "110785"), Bus(stopId: "110591")], Watched, Now);

        Assert.Equal(2, standing.Count);
    }
}

public class WorthKeepingTests
{
    private const long Scheduled = 1787340000;

    [Fact]
    public void KeepsABusThatWentByNearItsTime()
    {
        Assert.True(PassageObserver.WorthKeeping(Scheduled, Scheduled));
        Assert.True(PassageObserver.WorthKeeping(Scheduled + (35 * 60), Scheduled));
        Assert.True(PassageObserver.WorthKeeping(Scheduled - (20 * 60), Scheduled));
    }

    [Fact]
    public void ThrowsAwayAPassageADayOutOfPlace()
    {
        Assert.False(PassageObserver.WorthKeeping(Scheduled - (1451 * 60), Scheduled));
        Assert.False(PassageObserver.WorthKeeping(Scheduled + (4 * 3600), Scheduled));
    }
}
