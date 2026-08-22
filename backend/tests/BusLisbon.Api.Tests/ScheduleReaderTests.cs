using BusLisbon.Api.Schedules;

namespace BusLisbon.Api.Tests;

public class ScheduleReaderTests
{
    private static readonly TimeZoneInfo Lisbon = TimeZoneInfo.FindSystemTimeZoneById("Europe/Lisbon");

    private static TmlPattern Pattern(params TmlTripGroup[] groups) => new()
    {
        Id = "[BNA17]2753_0_1",
        LineId = "[BNA17]2753",
        Headsign = "Milharado",
        Trips = [.. groups]
    };

    private static TmlTripGroup Group(string arrivalTime, string stopId, string[] tripIds, string[] validOn) => new()
    {
        Schedule = [new TmlScheduleEntry { ArrivalTime = arrivalTime, StopId = stopId, StopSequence = 4 }],
        TripIds = [.. tripIds],
        ValidOn = [.. validOn]
    };

    [Fact]
    public void ReadsAPlainTime()
    {
        Assert.Equal((7 * 3600) + (13 * 60), ScheduleReader.SecondsIntoDay("07:13:00"));
    }

    [Fact]
    public void ReadsATimePastMidnight()
    {
        Assert.Equal((24 * 3600) + (34 * 60) + 2, ScheduleReader.SecondsIntoDay("24:34:02"));
    }

    [Fact]
    public void RefusesSomethingThatIsNotATime()
    {
        Assert.Null(ScheduleReader.SecondsIntoDay("nope"));
        Assert.Null(ScheduleReader.SecondsIntoDay("07:13"));
        Assert.Null(ScheduleReader.SecondsIntoDay("07:99:00"));
    }

    [Fact]
    public void APastMidnightTimeLandsOnTheNextDay()
    {
        var date = new DateOnly(2026, 8, 21);
        var late = ScheduleReader.ToUnix(date, ScheduleReader.SecondsIntoDay("24:34:02")!.Value, Lisbon);
        var earlyNextDay = ScheduleReader.ToUnix(new DateOnly(2026, 8, 22), (34 * 60) + 2, Lisbon);

        Assert.Equal(earlyNextDay, late);
    }

    [Fact]
    public void ReadsTheDepartureOffATripId()
    {
        Assert.Equal("1835", ScheduleReader.DepartureTag("[0277F][BNA17]2753_0_1|150|3|1835"));
        Assert.Equal("0700", ScheduleReader.DepartureTag("[Y8LCX][BNA17]2753_0_1|150|5|0700"));
    }

    [Fact]
    public void GivesNothingForATripIdWithNoDeparture()
    {
        Assert.Equal(string.Empty, ScheduleReader.DepartureTag("2753_0_1"));
        Assert.Equal(string.Empty, ScheduleReader.DepartureTag("2753_0_1|"));
    }

    [Fact]
    public void ListsOnlyTheGroupsRunningThatDay()
    {
        var pattern = Pattern(
            Group("07:13:00", "110622", ["[X]2753_0_1|150|3|0700"], ["20260821"]),
            Group("09:13:00", "110622", ["[X]2753_0_1|150|3|0900"], ["20260822"]));

        var calls = ScheduleReader.CallsAt(pattern, "110622", new DateOnly(2026, 8, 21), Lisbon);

        Assert.Single(calls);
        Assert.Equal("Milharado", calls[0].Headsign);
    }

    [Fact]
    public void CountsOneDepartureEvenWhenTheGroupListsEveryCalendarVariant()
    {
        var pattern = Pattern(Group(
            "07:09:00",
            "110785",
            [
                "[Y8LCX][BNA17]2753_0_1|150|5|0700",
                "[Y8LCX][BNA17]2753_0_1|150|3|0700",
                "[Y8LCX][BNA17]2753_0_1|150|2|0700"
            ],
            ["20260821"]));

        var calls = ScheduleReader.CallsAt(pattern, "110785", new DateOnly(2026, 8, 21), Lisbon);

        Assert.Single(calls);
        Assert.Equal("0700", calls[0].Departure);
    }

    [Fact]
    public void SkipsAStopThePatternDoesNotServe()
    {
        var pattern = Pattern(Group("07:13:00", "110622", ["[X]2753_0_1|150|3|0700"], ["20260821"]));

        Assert.Empty(ScheduleReader.CallsAt(pattern, "999999", new DateOnly(2026, 8, 21), Lisbon));
    }

    [Fact]
    public void MatchesALiveTripToItsScheduledTime()
    {
        var pattern = Pattern(
            Group("07:13:00", "110622", ["[Y8LCX][BNA17]2753_0_1|150|5|0700"], ["20260821"]),
            Group("18:35:00", "110622", ["[Y8LCX][BNA17]2753_0_1|150|5|1835"], ["20260821"]));

        var scheduled = ScheduleReader.ScheduledFor(
            pattern, "110622", "[0277F][BNA17]2753_0_1|150|3|1835", new DateOnly(2026, 8, 21), Lisbon);

        Assert.Equal(ScheduleReader.ToUnix(new DateOnly(2026, 8, 21), (18 * 3600) + (35 * 60), Lisbon), scheduled);
    }

    [Fact]
    public void GivesNothingWhenTheTripIsNotInTheTimetable()
    {
        var pattern = Pattern(Group("07:13:00", "110622", ["[X]2753_0_1|150|3|0700"], ["20260821"]));

        Assert.Null(ScheduleReader.ScheduledFor(
            pattern, "110622", "[X]2753_0_1|150|3|2359", new DateOnly(2026, 8, 21), Lisbon));
    }
}

public class OperationalDayTests
{
    private static readonly TimeZoneInfo Lisbon = TimeZoneInfo.FindSystemTimeZoneById("Europe/Lisbon");

    private static DateOnly At(string utc) =>
        ScheduleReader.OperationalDay(DateTimeOffset.Parse(utc, null, System.Globalization.DateTimeStyles.AdjustToUniversal), Lisbon);

    [Fact]
    public void CountsTheSmallHoursAsThePreviousDay()
    {
        Assert.Equal(new DateOnly(2026, 8, 21), At("2026-08-22T02:18:00Z"));
        Assert.Equal(new DateOnly(2026, 8, 21), At("2026-08-22T00:05:00Z"));
    }

    [Fact]
    public void RollsOverAtFourInTheMorning()
    {
        Assert.Equal(new DateOnly(2026, 8, 21), At("2026-08-22T02:59:00Z"));
        Assert.Equal(new DateOnly(2026, 8, 22), At("2026-08-22T03:00:00Z"));
    }

    [Fact]
    public void LeavesTheRestOfTheDayAlone()
    {
        Assert.Equal(new DateOnly(2026, 8, 22), At("2026-08-22T12:00:00Z"));
        Assert.Equal(new DateOnly(2026, 8, 22), At("2026-08-22T22:30:00Z"));
    }

    [Fact]
    public void ReadsTheClockInLisbonRatherThanInUtc()
    {
        Assert.Equal(new DateOnly(2026, 8, 22), At("2026-08-22T23:30:00Z"));
        Assert.Equal(new DateOnly(2026, 1, 21), At("2026-01-22T02:00:00Z"));
    }
}

public class LineNameTests
{
    [Fact]
    public void StripsTheAgencyOffALineName()
    {
        Assert.Equal("2753", ScheduleEndpoints.LineName("[BNA17]2753"));
        Assert.Equal("2753", ScheduleEndpoints.LineName("2753"));
    }
}
