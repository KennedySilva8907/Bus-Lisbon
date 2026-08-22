using BusLisbon.Api.Schedules;

namespace BusLisbon.Api.Tests;

public class BoardArrivalsTests
{
    private const long Now = 1787340000;

    private static BoardEntry Entry(
        bool isPast = false, bool isRealtime = true, long estimated = Now + 300, bool running = true) =>
        new(
            "[BNA17]2769", "[BNA17]2769_0_1", "Campo Grande",
            "[0277F][BNA17]2769_0_1|2|3|1230", "42|2548",
            Now + 240, estimated, isPast ? estimated : Now + 240, isPast, isRealtime, running);

    [Fact]
    public void HandsTheAlertJobTheLineWithoutItsAgency()
    {
        var arrival = BoardArrivals.ToArrival(Entry());

        Assert.Equal("2769", arrival.LineId);
        Assert.Equal("2769_0_1", arrival.PatternId);
        Assert.Equal("42|2548", arrival.VehicleId);
    }

    [Fact]
    public void GivesAnArrivalTimeForABusStillOnItsWay()
    {
        var arrival = BoardArrivals.ToArrival(Entry());

        Assert.Equal(Now + 300, arrival.EstimatedArrivalUnix);
        Assert.Equal(Now + 240, arrival.ScheduledArrivalUnix);
        Assert.Equal(Now + 300, arrival.ArrivalUnix);
        Assert.Null(arrival.ObservedArrivalUnix);
    }

    [Fact]
    public void FallsBackToTheTimetableWhenThereIsNoEstimate()
    {
        var arrival = BoardArrivals.ToArrival(Entry(isRealtime: false, estimated: 0));

        Assert.Null(arrival.EstimatedArrivalUnix);
        Assert.Equal(Now + 240, arrival.ArrivalUnix);
    }

    [Fact]
    public void WillNotClaimAPassageItNeverMeasured()
    {
        var arrival = BoardArrivals.ToArrival(Entry(isPast: true, isRealtime: false, estimated: 0));

        Assert.Null(arrival.ObservedArrivalUnix);
    }

    [Fact]
    public void MarksAPassageItDidMeasure()
    {
        var arrival = BoardArrivals.ToArrival(Entry(isPast: true, estimated: Now - 120));

        Assert.Equal(Now - 120, arrival.ObservedArrivalUnix);
        Assert.Null(arrival.EstimatedArrivalUnix);
    }
}
