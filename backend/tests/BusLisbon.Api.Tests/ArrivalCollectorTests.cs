using BusLisbon.Api.Carris;
using BusLisbon.Api.Observations;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace BusLisbon.Api.Tests;

public class ArrivalCollectorTests : IDisposable
{
    private readonly SqliteConnection _connection = new("Filename=:memory:");
    private readonly DbContextOptions<ObservationsContext> _options;
    private readonly StubArrivals _arrivals = new();

    public ArrivalCollectorTests()
    {
        _connection.Open();
        _options = new DbContextOptionsBuilder<ObservationsContext>().UseSqlite(_connection).Options;

        using var context = new ObservationsContext(_options);
        context.Database.EnsureCreated();
    }

    private ObservationsContext Open() => new(_options);

    private async Task<CollectionReport> CollectAsync(params string[] stops)
    {
        await using var context = Open();

        var collector = new ArrivalCollector(
            _arrivals, context, Options.Create(new CollectionOptions { BatchSize = 2 }),
            NullLogger<ArrivalCollector>.Instance);

        return await collector.CollectOnceAsync(stops, CancellationToken.None);
    }

    private static CarrisArrival Passage(long scheduled, long? observed, string lineId = "1235") => new()
    {
        LineId = lineId,
        PatternId = "1235_0_2",
        ScheduledArrivalUnix = scheduled,
        EstimatedArrivalUnix = scheduled + 60,
        ObservedArrivalUnix = observed,
    };

    [Fact]
    public async Task ItWritesThePassagesItFound()
    {
        _arrivals.For("A", Passage(1_755_500_000, 1_755_500_120), Passage(1_755_503_600, 1_755_503_700));

        var report = await CollectAsync("A");

        Assert.Equal(2, report.Written);
        Assert.Equal(1, report.StopsRead);

        await using var context = Open();
        Assert.Equal(2, await context.Arrivals.CountAsync());
    }

    [Fact]
    public async Task APassageNobodySawIsNotWritten()
    {
        _arrivals.For("A", Passage(1_755_500_000, observed: null));

        var report = await CollectAsync("A");

        Assert.Equal(0, report.Written);
    }

    [Fact]
    public async Task RunningItTwiceWritesNothingTheSecondTime()
    {
        _arrivals.For("A", Passage(1_755_500_000, 1_755_500_120));

        await CollectAsync("A");
        var again = await CollectAsync("A");

        Assert.Equal(0, again.Written);
        Assert.Equal(1, again.Seen);

        await using var context = Open();
        Assert.Equal(1, await context.Arrivals.CountAsync());
    }

    [Fact]
    public async Task ASecondRunStillPicksUpWhatAppearedSince()
    {
        _arrivals.For("A", Passage(1_755_500_000, 1_755_500_120));
        await CollectAsync("A");

        _arrivals.For("A", Passage(1_755_500_000, 1_755_500_120), Passage(1_755_507_200, 1_755_507_300));
        var again = await CollectAsync("A");

        Assert.Equal(1, again.Written);

        await using var context = Open();
        Assert.Equal(2, await context.Arrivals.CountAsync());
    }

    [Fact]
    public async Task AStopThatFailsDoesNotStopTheOthers()
    {
        _arrivals.Fail("A");
        _arrivals.For("B", Passage(1_755_500_000, 1_755_500_120));

        var report = await CollectAsync("A", "B");

        Assert.Equal(1, report.StopsFailed);
        Assert.Equal(1, report.StopsRead);
        Assert.Equal(1, report.Written);
    }

    [Fact]
    public async Task TheSameTimetableSlotAtTwoStopsIsTwoPassages()
    {
        _arrivals.For("A", Passage(1_755_500_000, 1_755_500_120));
        _arrivals.For("B", Passage(1_755_500_000, 1_755_500_300));

        var report = await CollectAsync("A", "B");

        Assert.Equal(2, report.Written);
    }

    [Fact]
    public async Task ItKeepsGoingPastTheBatchSize()
    {
        _arrivals.For("A",
            Passage(1_755_500_000, 1_755_500_120),
            Passage(1_755_500_100, 1_755_500_220),
            Passage(1_755_500_200, 1_755_500_320),
            Passage(1_755_500_300, 1_755_500_420),
            Passage(1_755_500_400, 1_755_500_520));

        var report = await CollectAsync("A");

        Assert.Equal(5, report.Written);

        await using var context = Open();
        Assert.Equal(5, await context.Arrivals.CountAsync());
    }

    public void Dispose() => _connection.Dispose();

    private sealed class StubArrivals : ICarrisArrivals
    {
        private readonly Dictionary<string, IReadOnlyList<CarrisArrival>> _byStop = [];
        private readonly HashSet<string> _broken = [];

        public void For(string stopId, params CarrisArrival[] arrivals) => _byStop[stopId] = arrivals;

        public void Fail(string stopId) => _broken.Add(stopId);

        public Task<IReadOnlyList<CarrisArrival>> GetArrivalsAsync(
            string stopId, CancellationToken cancellationToken)
        {
            if (_broken.Contains(stopId))
            {
                throw new CarrisFeedException($"stop {stopId} is broken");
            }

            return Task.FromResult(_byStop.GetValueOrDefault(stopId, []));
        }
    }
}
