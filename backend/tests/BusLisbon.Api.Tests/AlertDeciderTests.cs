using BusLisbon.Api.Alerts;
using BusLisbon.Api.Carris;

namespace BusLisbon.Api.Tests;

public class AlertDeciderTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-08-17T09:00:00Z");

    private static Alert AlertFor(int thresholdMinutes = 10, int? missCount = null) => new(
        "id", "https://push.example/abc", "41|814", "1235", "1235_0_2", "060003", "Cascais",
        thresholdMinutes, Now.ToUnixTimeMilliseconds(), AlertStatus.Pending, missCount);

    private static CarrisArrival Arrival(
        double minutesAway, string vehicleId = "41|814", long? observed = null) => new()
        {
            VehicleId = vehicleId,
            LineId = "1235",
            PatternId = "1235_0_2",
            EstimatedArrivalUnix = Now.AddMinutes(minutesAway).ToUnixTimeSeconds(),
            ScheduledArrivalUnix = Now.AddMinutes(minutesAway).ToUnixTimeSeconds(),
            ObservedArrivalUnix = observed
        };

    private static readonly AlertOptions EveryTwoMinutes = new() { CheckInterval = TimeSpan.FromMinutes(2) };

    private static AlertDecision Decide(Alert alert, params CarrisArrival[] arrivals) =>
        AlertDecider.Decide(alert, arrivals, Now, EveryTwoMinutes);

    private static AlertDecision DecideEvery(TimeSpan interval, Alert alert, params CarrisArrival[] arrivals) =>
        AlertDecider.Decide(alert, arrivals, Now, new AlertOptions { CheckInterval = interval });

    [Fact]
    public void ABusStillFarAwayIsLeftAlone()
    {
        Assert.Equal(AlertOutcome.Wait, Decide(AlertFor(), Arrival(25)).Outcome);
    }

    [Fact]
    public void ABusInsideTheThresholdFires()
    {
        Assert.Equal(AlertOutcome.Fire, Decide(AlertFor(thresholdMinutes: 10), Arrival(8)).Outcome);
    }

    [Fact]
    public void ABusJustOutsideTheThresholdStillFires()
    {
        Assert.Equal(AlertOutcome.Fire, Decide(AlertFor(thresholdMinutes: 10), Arrival(10.7)).Outcome);
    }

    [Fact]
    public void ABusTooFarForTheToleranceDoesNotFire()
    {
        Assert.Equal(AlertOutcome.Wait, Decide(AlertFor(thresholdMinutes: 10), Arrival(13)).Outcome);
    }

    [Fact]
    public void TheToleranceFollowsHowOftenWeCheck()
    {
        var alert = AlertFor(thresholdMinutes: 10);
        var almost = Arrival(11.5);

        Assert.Equal(
            AlertOutcome.Wait,
            DecideEvery(TimeSpan.FromMinutes(1), alert, almost).Outcome);

        Assert.Equal(
            AlertOutcome.Fire,
            DecideEvery(TimeSpan.FromMinutes(2), alert, almost).Outcome);
    }

    [Fact]
    public void CheckingLessOftenNeverShowsMoreMinutesThanWereAskedFor()
    {
        var decision = DecideEvery(TimeSpan.FromMinutes(5), AlertFor(thresholdMinutes: 10), Arrival(14));

        Assert.Equal(AlertOutcome.Fire, decision.Outcome);
        Assert.Equal(10, decision.MinutesToShow);
    }

    [Fact]
    public void ABusThatJustPassedStillFires()
    {
        Assert.Equal(AlertOutcome.Fire, Decide(AlertFor(), Arrival(-0.5)).Outcome);
    }

    [Fact]
    public void ABusAFullMinutePastIsNoLongerInTheWindow()
    {
        Assert.Equal(AlertOutcome.Missed, Decide(AlertFor(), Arrival(-1)).Outcome);
    }

    [Fact]
    public void ABusLongGoneCountsAsAMissRatherThanExpiringOnTheSpot()
    {
        Assert.Equal(AlertOutcome.Missed, Decide(AlertFor(), Arrival(-5)).Outcome);
    }

    [Fact]
    public void TheMinutesShownNeverExceedWhatWasAskedFor()
    {
        var decision = Decide(AlertFor(thresholdMinutes: 10), Arrival(10.7));

        Assert.Equal(10, decision.MinutesToShow);
    }

    [Fact]
    public void FiringLateShowsTheSmallerNumberWeActuallySaw()
    {
        var decision = Decide(AlertFor(thresholdMinutes: 10), Arrival(4.2));

        Assert.Equal(4, decision.MinutesToShow);
    }

    [Fact]
    public void TheMinutesShownAreNeverZero()
    {
        var decision = Decide(AlertFor(thresholdMinutes: 10), Arrival(0.1));

        Assert.Equal(1, decision.MinutesToShow);
    }

    [Fact]
    public void ABusMissingFromTheFeedCountsAsAMiss()
    {
        var decision = Decide(AlertFor(), Arrival(5, vehicleId: "41|999"));

        Assert.Equal(AlertOutcome.Missed, decision.Outcome);
        Assert.Equal(1, decision.MissCount);
    }

    [Fact]
    public void MissesAccumulate()
    {
        Assert.Equal(4, Decide(AlertFor(missCount: 3)).MissCount);
    }

    [Fact]
    public void TheFifthMissExpiresTheAlert()
    {
        Assert.Equal(AlertOutcome.Expire, Decide(AlertFor(missCount: new AlertOptions().MaxMisses - 1)).Outcome);
    }

    [Fact]
    public void ABusBackInTheFeedResetsTheMissCounter()
    {
        var decision = Decide(AlertFor(thresholdMinutes: 10, missCount: 3), Arrival(25));

        Assert.Equal(AlertOutcome.Missed, decision.Outcome);
        Assert.Equal(0, decision.MissCount);
    }

    [Fact]
    public void AnArrivalAlreadyObservedInThePastIsIgnored()
    {
        var passed = Arrival(-0.5, observed: Now.AddMinutes(-0.5).ToUnixTimeSeconds());

        Assert.Equal(AlertOutcome.Missed, Decide(AlertFor(), passed).Outcome);
    }

    [Fact]
    public void TheEarliestFuturePassageIsTheOneThatCounts()
    {
        var decision = Decide(AlertFor(thresholdMinutes: 10), Arrival(45), Arrival(6), Arrival(20));

        Assert.Equal(AlertOutcome.Fire, decision.Outcome);
        Assert.Equal(6, decision.MinutesToShow);
    }

    [Fact]
    public void AnotherBusOnTheSameLineIsNotOurs()
    {
        var decision = Decide(AlertFor(thresholdMinutes: 10), Arrival(3, vehicleId: "41|000"), Arrival(8));

        Assert.Equal(AlertOutcome.Fire, decision.Outcome);
        Assert.Equal(8, decision.MinutesToShow);
    }

    [Fact]
    public void OnlyAnotherBusInTheFeedIsStillAMiss()
    {
        Assert.Equal(AlertOutcome.Missed, Decide(AlertFor(), Arrival(3, vehicleId: "41|000")).Outcome);
    }
}
