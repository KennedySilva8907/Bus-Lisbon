using BusLisbon.Api.Carris;
using BusLisbon.Api.Observations;

namespace BusLisbon.Api.Tests;

public class ObservedPassagesTests
{
    private static readonly TimeZoneInfo Lisbon = TimeZoneInfo.FindSystemTimeZoneById("Europe/Lisbon");

    private static CarrisArrival Arrival(
        long scheduled, long? observed, long? estimated = null, string? lineId = "1235") => new()
        {
            LineId = lineId,
            PatternId = "1235_0_2",
            ScheduledArrivalUnix = scheduled,
            EstimatedArrivalUnix = estimated,
            ObservedArrivalUnix = observed,
        };

    private static IReadOnlyList<ArrivalObservation> From(params CarrisArrival[] arrivals) =>
        ObservedPassages.From("060003", arrivals, Lisbon);

    [Fact]
    public void OnlyAPassageThatWasSeenCounts()
    {
        var passages = From(
            Arrival(1_755_500_000, observed: 1_755_500_180),
            Arrival(1_755_503_600, observed: null));

        Assert.Single(passages);
        Assert.Equal(1_755_500_180, passages[0].ObservedUnix);
    }

    [Fact]
    public void APassageWithoutALineIsSkipped()
    {
        Assert.Empty(From(Arrival(1_755_500_000, observed: 1_755_500_180, lineId: null)));
    }

    [Fact]
    public void APassageWithoutATimetableTimeIsSkipped()
    {
        var arrival = new CarrisArrival
        {
            LineId = "1235",
            ObservedArrivalUnix = 1_755_500_180,
            ScheduledArrivalUnix = null,
        };

        Assert.Empty(From(arrival));
    }

    [Fact]
    public void AnEstimateThatOnlyRepeatsTheTimetableIsNotAPrediction()
    {
        var passages = From(Arrival(1_755_500_000, observed: 1_755_500_180, estimated: 1_755_500_000));

        Assert.Null(passages[0].EstimatedUnix);
        Assert.Null(passages[0].PredictionErrorSeconds);
    }

    [Fact]
    public void ARealPredictionIsKept()
    {
        var passages = From(Arrival(1_755_500_000, observed: 1_755_500_180, estimated: 1_755_500_120));

        Assert.Equal(1_755_500_120, passages[0].EstimatedUnix);
        Assert.Equal(60, passages[0].PredictionErrorSeconds);
    }

    [Fact]
    public void TheSamePassageListedTwiceIsKeptOnce()
    {
        var passages = From(
            Arrival(1_755_500_000, observed: 1_755_500_180),
            Arrival(1_755_500_000, observed: 1_755_500_181));

        Assert.Single(passages);
    }

    [Fact]
    public void TheServiceDateIsTheLisbonDateNotUtc()
    {
        // 23:30 UTC in August is already 00:30 of the next day in Lisbon.
        var lateNight = DateTimeOffset.Parse("2026-08-18T23:30:00+00:00").ToUnixTimeSeconds();

        var passages = From(Arrival(lateNight, observed: lateNight + 60));

        Assert.Equal(new DateOnly(2026, 8, 19), passages[0].ServiceDate);
    }

    [Fact]
    public void TheSampleCoversEveryLineTwice()
    {
        Assert.Equal(258, SampleStops.All.Count);
        Assert.Equal(SampleStops.All.Count, SampleStops.All.Distinct().Count());
    }
}
