using BusLisbon.Api.Schedules;
using BusLisbon.Api.Vehicles;

namespace BusLisbon.Api.Tests;

public class StopBoardTests
{
    private const long Now = 1787340000;

    private static readonly TimeSpan Behind = TimeSpan.FromHours(2);
    private static readonly TimeSpan Ahead = TimeSpan.FromHours(2);

    private static readonly TmlScheduleEntry[] AlongTheRoute =
    [
        new() { ArrivalTime = "18:20:00", StopId = "110001", StopSequence = 1 },
        new() { ArrivalTime = "18:30:00", StopId = "110785", StopSequence = 5 },
        new() { ArrivalTime = "18:40:00", StopId = "110999", StopSequence = 9 },
    ];

    private static ScheduledCall Call(
        string departure = "1835", long secondsAway = 240, bool last = false) =>
        new("2753", "[BNA17]2753_0_1", "Milharado",
            [$"[BNA17]2753_0_1|1|3|{departure}"], Now + secondsAway, last, 5, AlongTheRoute);

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
    public void MatchesAnEstimateWhoseTripIdCarriesADifferentPlan()
    {
        var call = new ScheduledCall(
            "3701", "[YA15B]3701_0_1", "Cacilhas",
            ["[YA15B]3701_0_1_0500_0529_0_VER_DU"], Now + 240, false, 5, AlongTheRoute);

        var eta = new LiveEta(
            "[82YP2][YA15B]3701_0_1_0500_0529_0_VER_DU", "[YA15B]3701_0_1", "2600", Now + 300);

        var board = Build([call], [eta]);

        Assert.Single(board);
        Assert.True(board[0].IsRealtime);
        Assert.Equal("2600", board[0].VehicleId);
    }

    [Fact]
    public void KeepsADepartureFromAnOperatorNoEstimateCanBeMatchedTo()
    {
        var call = new ScheduledCall(
            "M29", "[HF16N]M29_0_1", "CascaiShopping",
            ["[HF16N]M29-2-002-A-U-07h40"], Now + 600, false, 5, AlongTheRoute);

        var board = Build([call], []);

        Assert.Single(board);
        Assert.False(board[0].IsRealtime);
        Assert.Equal(Now + 600, board[0].EffectiveUnix);
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

    [Fact]
    public void ADepartureIsNotGoneWhileItsBusIsStillShortOfTheStop()
    {
        var fleet = new Dictionary<string, RunningBus>
        {
            ["2753_0_1|1|3|1835"] = new("42|2524", "110001")
        };

        var board = StopBoard.Build([Call(secondsAway: -900)], [], Now, Behind, Ahead, fleet);

        Assert.Single(board);
        Assert.False(board[0].IsPast);
        Assert.True(board[0].TripRunning);
    }

    [Fact]
    public void ADepartureIsGoneOnceItsBusIsFurtherAlongTheRoute()
    {
        var fleet = new Dictionary<string, RunningBus>
        {
            ["2753_0_1|1|3|1835"] = new("42|2524", "110999")
        };

        var board = StopBoard.Build([Call(secondsAway: -900)], [], Now, Behind, Ahead, fleet);

        Assert.Single(board);
        Assert.True(board[0].IsPast);
    }

    [Fact]
    public void ADepartureWithNoBusOnTheRoadGoesByTheTimetable()
    {
        var board = StopBoard.Build([Call(secondsAway: -900)], [], Now, Behind, Ahead, new Dictionary<string, RunningBus>());

        Assert.Single(board);
        Assert.True(board[0].IsPast);
        Assert.False(board[0].TripRunning);
    }

    [Fact]
    public void ABusAtAStopTheTripDoesNotServeSaysNothingAboutOurs()
    {
        var fleet = new Dictionary<string, RunningBus>
        {
            ["2753_0_1|1|3|1835"] = new("42|2524", "999999")
        };

        var board = StopBoard.Build([Call(secondsAway: -900)], [], Now, Behind, Ahead, fleet);

        Assert.Single(board);
        Assert.True(board[0].IsPast);
    }
}
