using BusLisbon.Api.Schedules;

namespace BusLisbon.Api.Tests;

public class StopBoardTests
{
    private const long Now = 1787340000;

    private static readonly TimeSpan Behind = TimeSpan.FromHours(2);
    private static readonly TimeSpan Ahead = TimeSpan.FromHours(2);

    private static ScheduledCall Call(
        string departure = "1835", long secondsAway = 240, bool last = false) =>
        new("2753", "[BNA17]2753_0_1", "Milharado", departure, Now + secondsAway, last);

    private static LiveEta Eta(string departure = "1835", long secondsAway = 300) =>
        new($"[0277F][BNA17]2753_0_1|1|3|{departure}", "[BNA17]2753_0_1", "1257", Now + secondsAway);

    private static IReadOnlyList<BoardEntry> Build(
        IReadOnlyList<ScheduledCall> timetable, IReadOnlyList<LiveEta> etas) =>
        StopBoard.Build(timetable, etas, Now, Behind, Ahead);

    [Fact]
    public void AScheduledCallWithNoEstimateShowsTheTimetableTime()
    {
        var board = Build([Call(secondsAway: 900)], []);

        Assert.Single(board);
        Assert.False(board[0].IsRealtime);
        Assert.False(board[0].IsPast);
        Assert.Equal(Now + 900, board[0].EffectiveUnix);
    }

    [Fact]
    public void AnEstimateReplacesTheTimetableTime()
    {
        var board = Build([Call(secondsAway: 240)], [Eta(secondsAway: 300)]);

        Assert.Single(board);
        Assert.True(board[0].IsRealtime);
        Assert.Equal(Now + 300, board[0].EffectiveUnix);
        Assert.Equal(Now + 240, board[0].ScheduledUnix);
    }

    [Fact]
    public void AnEstimateInThePastMeansTheBusHasGoneBy()
    {
        var board = Build([Call(secondsAway: 240)], [Eta(secondsAway: -42)]);

        Assert.Single(board);
        Assert.True(board[0].IsPast);
        Assert.True(board[0].IsRealtime);
    }

    [Fact]
    public void AScheduledCallWhoseTimeHasGoneIsPastEvenWithNoEstimate()
    {
        var board = Build([Call(secondsAway: -600)], []);

        Assert.Single(board);
        Assert.True(board[0].IsPast);
        Assert.False(board[0].IsRealtime);
    }

    [Fact]
    public void TheLastStopOfAPatternIsNotAnArrival()
    {
        Assert.Empty(Build([Call(last: true)], [Eta()]));
    }

    [Fact]
    public void ForgetsWhatHappenedLongAgo()
    {
        Assert.Empty(Build([Call(secondsAway: -10800)], []));
    }

    [Fact]
    public void IgnoresWhatIsStillHoursAway()
    {
        Assert.Empty(Build([Call(secondsAway: 10800)], []));
    }

    [Fact]
    public void MatchesTheEstimateToItsOwnDeparture()
    {
        var board = Build(
            [Call("1835", 240), Call("1905", 2040)],
            [Eta("1905", 1800)]);

        Assert.Equal(2, board.Count);
        Assert.False(board[0].IsRealtime);
        Assert.True(board[1].IsRealtime);
        Assert.Equal(Now + 1800, board[1].EffectiveUnix);
    }

    [Fact]
    public void PutsThemInTheOrderTheyHappen()
    {
        var board = Build(
            [Call("1800", -300), Call("1835", 240), Call("1905", 1800)],
            []);

        Assert.Equal([Now - 300, Now + 240, Now + 1800], board.Select(entry => entry.EffectiveUnix));
    }

    [Fact]
    public void AnEstimateWithNoTimetableRowIsNotInvented()
    {
        Assert.Empty(Build([], [Eta()]));
    }

    [Fact]
    public void AnEmptyStopGivesAnEmptyBoard()
    {
        Assert.Empty(Build([], []));
    }
}
