using BusLisbon.Api.Schedules;
using Microsoft.Extensions.Time.Testing;

namespace BusLisbon.Api.Tests;

public class PassageLogTests
{
    private static (PassageLog log, FakeTimeProvider clock) Fresh()
    {
        var clock = new FakeTimeProvider(new DateTimeOffset(2026, 8, 21, 18, 0, 0, TimeSpan.Zero));

        return (new PassageLog(clock), clock);
    }

    private static ObservedPassage Passage(string tripId, long observedUnix) =>
        new(tripId, "[BNA17]2753_0_1", "2753", "Milharado", observedUnix, observedUnix - 120);

    [Fact]
    public void WatchesAStopThatWasAskedFor()
    {
        var (log, _) = Fresh();

        log.Wanted("110785");

        Assert.Equal(["110785"], log.Watching());
    }

    [Fact]
    public void ForgetsAStopNobodyHasLookedAtForAWhile()
    {
        var (log, clock) = Fresh();

        log.Wanted("110785");
        clock.Advance(PassageLog.WatchFor + TimeSpan.FromMinutes(1));

        Assert.Empty(log.Watching());
    }

    [Fact]
    public void KeepsWatchingWhileSomebodyKeepsAsking()
    {
        var (log, clock) = Fresh();

        log.Wanted("110785");
        clock.Advance(TimeSpan.FromMinutes(15));
        log.Wanted("110785");
        clock.Advance(TimeSpan.FromMinutes(15));

        Assert.Equal(["110785"], log.Watching());
    }

    [Fact]
    public void RecordsAPassageAndGivesItBack()
    {
        var (log, clock) = Fresh();
        var now = clock.GetUtcNow().ToUnixTimeSeconds();

        log.Record("110785", [Passage("a", now)]);

        var kept = log.At("110785");

        Assert.Single(kept);
        Assert.Equal("Milharado", kept[0].Headsign);
    }

    [Fact]
    public void DoesNotRecordTheSameTripTwice()
    {
        var (log, clock) = Fresh();
        var now = clock.GetUtcNow().ToUnixTimeSeconds();

        log.Record("110785", [Passage("a", now)]);
        log.Record("110785", [Passage("a", now + 30)]);

        Assert.Single(log.At("110785"));
    }

    [Fact]
    public void ForgetsPassagesOlderThanTheWindow()
    {
        var (log, clock) = Fresh();
        var now = clock.GetUtcNow().ToUnixTimeSeconds();

        log.Record("110785", [Passage("a", now)]);
        clock.Advance(PassageLog.Window + TimeSpan.FromMinutes(5));
        log.Record("110785", [Passage("b", clock.GetUtcNow().ToUnixTimeSeconds())]);

        Assert.Equal(["b"], log.At("110785").Select(passage => passage.TripId));
    }

    [Fact]
    public void PutsTheMostRecentPassageFirst()
    {
        var (log, clock) = Fresh();
        var now = clock.GetUtcNow().ToUnixTimeSeconds();

        log.Record("110785", [Passage("older", now - 600), Passage("newer", now - 60)]);

        Assert.Equal(["newer", "older"], log.At("110785").Select(passage => passage.TripId));
    }

    [Fact]
    public void KeepsStopsApart()
    {
        var (log, clock) = Fresh();
        var now = clock.GetUtcNow().ToUnixTimeSeconds();

        log.Record("110785", [Passage("a", now)]);

        Assert.Empty(log.At("110591"));
    }

    [Fact]
    public void RemembersWhatWasSeenLastTime()
    {
        var (log, _) = Fresh();
        var trips = new Dictionary<string, ApproachingTrip>
        {
            ["a"] = new("a", "[BNA17]2753_0_1", "2753", "1257", 1787340000)
        };

        log.Remember("110785", trips);

        Assert.Single(log.LastSeenAt("110785"));
        Assert.Empty(log.LastSeenAt("110591"));
    }
}

public class TripIdReadingTests
{
    [Theory]
    [InlineData("[XS3H8][LA77N]1218_0_1_1800_1829_0_7", "1218", "1218_0_1", "[LA77N]1218_0_1")]
    [InlineData("[0277F][BNA17]2753_0_1|150|3|1835", "2753", "2753_0_1", "[BNA17]2753_0_1")]
    [InlineData("4701_0_2|500|1645", "4701", "4701_0_2", "4701_0_2")]
    public void ReadsEveryShapeTheFeedSends(string tripId, string line, string pattern, string agencyPattern)
    {
        var parts = TmlArrivalsClient.ReadTripId(tripId)!;

        Assert.Equal(line, parts.LineId);
        Assert.Equal(pattern, parts.PatternId);
        Assert.Equal(agencyPattern, parts.AgencyPatternId);
    }

    [Theory]
    [InlineData("")]
    [InlineData("1218")]
    [InlineData("[BNA17]nao_e_padrao")]
    public void RefusesWhatItCannotRead(string tripId)
    {
        Assert.Null(TmlArrivalsClient.ReadTripId(tripId));
    }
}
