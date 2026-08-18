using BusLisbon.Api.Observations;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace BusLisbon.Api.Tests;

public class ArrivalObservationTests : IDisposable
{
    private readonly SqliteConnection _connection = new("Filename=:memory:");
    private readonly DbContextOptions<ObservationsContext> _options;

    public ArrivalObservationTests()
    {
        _connection.Open();
        _options = new DbContextOptionsBuilder<ObservationsContext>().UseSqlite(_connection).Options;

        using var context = new ObservationsContext(_options);
        context.Database.EnsureCreated();
    }

    private ObservationsContext Open() => new(_options);

    private static ArrivalObservation Passage(
        long scheduled = 1_755_500_000, long observed = 1_755_500_180, long? estimated = 1_755_500_120,
        string lineId = "1235", string stopId = "060003") => new()
        {
            LineId = lineId,
            StopId = stopId,
            PatternId = "1235_0_2",
            ServiceDate = new DateOnly(2026, 8, 18),
            ScheduledUnix = scheduled,
            EstimatedUnix = estimated,
            ObservedUnix = observed,
        };

    [Fact]
    public async Task APassageComesBackAsItWentIn()
    {
        await using (var context = Open())
        {
            context.Arrivals.Add(Passage());
            await context.SaveChangesAsync();
        }

        await using var reading = Open();
        var stored = await reading.Arrivals.SingleAsync();

        Assert.Equal("1235", stored.LineId);
        Assert.Equal(new DateOnly(2026, 8, 18), stored.ServiceDate);
        Assert.Equal(1_755_500_180, stored.ObservedUnix);
    }

    [Fact]
    public async Task TheSamePassageTwiceIsRefused()
    {
        await using (var context = Open())
        {
            context.Arrivals.Add(Passage());
            await context.SaveChangesAsync();
        }

        await using var again = Open();
        again.Arrivals.Add(Passage());

        await Assert.ThrowsAsync<DbUpdateException>(() => again.SaveChangesAsync());
    }

    [Fact]
    public async Task TheSameLineLaterInTheDayIsADifferentPassage()
    {
        await using var context = Open();

        context.Arrivals.Add(Passage(scheduled: 1_755_500_000));
        context.Arrivals.Add(Passage(scheduled: 1_755_503_600));
        await context.SaveChangesAsync();

        Assert.Equal(2, await context.Arrivals.CountAsync());
    }

    [Fact]
    public async Task TheSameMinuteAtAnotherStopIsADifferentPassage()
    {
        await using var context = Open();

        context.Arrivals.Add(Passage(stopId: "060003"));
        context.Arrivals.Add(Passage(stopId: "070001"));
        await context.SaveChangesAsync();

        Assert.Equal(2, await context.Arrivals.CountAsync());
    }

    [Fact]
    public void LatenessIsMeasuredAgainstTheTimetable()
    {
        Assert.Equal(180, Passage(scheduled: 1_755_500_000, observed: 1_755_500_180).LatenessSeconds);
    }

    [Fact]
    public void ThePredictionErrorIsMeasuredAgainstWhatWasPredicted()
    {
        var passage = Passage(observed: 1_755_500_180, estimated: 1_755_500_120);

        Assert.Equal(60, passage.PredictionErrorSeconds);
    }

    [Fact]
    public void APassageNobodyPredictedHasNoPredictionError()
    {
        Assert.Null(Passage(estimated: null).PredictionErrorSeconds);
    }

    public void Dispose() => _connection.Dispose();
}
