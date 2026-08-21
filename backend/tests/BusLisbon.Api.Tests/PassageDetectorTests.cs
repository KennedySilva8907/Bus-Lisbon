using BusLisbon.Api.Schedules;

namespace BusLisbon.Api.Tests;

public class PassageDetectorTests
{
    private const long Now = 1787340000;

    private static Dictionary<string, ApproachingTrip> Feed(params ApproachingTrip[] trips) =>
        trips.ToDictionary(trip => trip.TripId);

    private static ApproachingTrip Trip(string id, long secondsAway) =>
        new(id, "[BNA17]2753_0_1", "2753", Now + secondsAway);

    [Fact]
    public void ABusThatWasAboutToArriveAndDisappearedHasPassed()
    {
        var passed = PassageDetector.Passed(Feed(Trip("a", 20)), Feed(), Now);

        Assert.Single(passed);
        Assert.Equal("a", passed[0].TripId);
    }

    [Fact]
    public void ABusStillInTheFeedHasNotPassed()
    {
        Assert.Empty(PassageDetector.Passed(Feed(Trip("a", 20)), Feed(Trip("a", 10)), Now));
    }

    [Fact]
    public void ABusThatVanishedWhileStillFarAwayIsNotCountedAsAPassage()
    {
        Assert.Empty(PassageDetector.Passed(Feed(Trip("a", 900)), Feed(), Now));
    }

    [Fact]
    public void ABusAlreadyOverdueCountsWhenItDisappears()
    {
        var passed = PassageDetector.Passed(Feed(Trip("a", -60)), Feed(), Now);

        Assert.Single(passed);
    }

    [Fact]
    public void OnlyTheOnesThatWentAreReported()
    {
        var before = Feed(Trip("a", 30), Trip("b", 40), Trip("c", 50));
        var after = Feed(Trip("b", 20));

        var passed = PassageDetector.Passed(before, after, Now);

        Assert.Equal(["a", "c"], passed.Select(trip => trip.TripId).Order());
    }

    [Fact]
    public void AnEmptyFeedDoesNotInventPassages()
    {
        Assert.Empty(PassageDetector.Passed(Feed(), Feed(), Now));
    }

    [Fact]
    public void KeepsWhatHappenedInsideTheWindow()
    {
        Assert.True(PassageDetector.WorthKeeping(Now - 600, Now, TimeSpan.FromHours(2)));
        Assert.True(PassageDetector.WorthKeeping(Now, Now, TimeSpan.FromHours(2)));
    }

    [Fact]
    public void ForgetsWhatIsOlderThanTheWindow()
    {
        Assert.False(PassageDetector.WorthKeeping(Now - 7300, Now, TimeSpan.FromHours(2)));
    }

    [Fact]
    public void RefusesSomethingDatedInTheFuture()
    {
        Assert.False(PassageDetector.WorthKeeping(Now + 60, Now, TimeSpan.FromHours(2)));
    }
}
