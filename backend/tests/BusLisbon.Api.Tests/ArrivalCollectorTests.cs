using BusLisbon.Api.Carris;
using BusLisbon.Api.Observations;
using BusLisbon.Api.Vehicles;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace BusLisbon.Api.Tests;

public class ArrivalCollectorTests : IDisposable
{
    private readonly SqliteConnection _connection = new("Filename=:memory:");
    private readonly DbContextOptions<ObservationsContext> _options;
    private readonly StubObserver _observer = new();
    private readonly StubFleet _fleet = new();

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
            _fleet, _observer, context, Options.Create(new CollectionOptions { BatchSize = 2 }),
            TimeProvider.System, NullLogger<ArrivalCollector>.Instance);

        return await collector.CollectOnceAsync(stops, CancellationToken.None);
    }

    private static ArrivalObservation Passage(
        long scheduled, long observed, string stopId = "A", string lineId = "1235") => new()
    {
        LineId = lineId,
        StopId = stopId,
        PatternId = "1235_0_2",
        ServiceDate = new DateOnly(2026, 8, 22),
        ScheduledUnix = scheduled,
        ObservedUnix = observed,
    };

    [Fact]
    public async Task ItWritesThePassagesItSaw()
    {
        _observer.Saw(Passage(1_755_500_000, 1_755_500_120), Passage(1_755_503_600, 1_755_503_700));

        var report = await CollectAsync("A");

        Assert.Equal(2, report.Written);
        Assert.Equal(2, report.Seen);
        Assert.Equal(1, report.StopsRead);

        await using var context = Open();
        Assert.Equal(2, await context.Arrivals.CountAsync());
    }

    [Fact]
    public async Task ItDoesNotWriteThePassageTwice()
    {
        _observer.Saw(Passage(1_755_500_000, 1_755_500_120));
        await CollectAsync("A");

        _observer.Saw(Passage(1_755_500_000, 1_755_500_180));
        var again = await CollectAsync("A");

        Assert.Equal(0, again.Written);

        await using var context = Open();
        Assert.Equal(1, await context.Arrivals.CountAsync());
    }

    [Fact]
    public async Task ItKeepsTheSameDepartureOnDifferentLines()
    {
        _observer.Saw(
            Passage(1_755_500_000, 1_755_500_120, lineId: "1235"),
            Passage(1_755_500_000, 1_755_500_150, lineId: "1236"));

        var report = await CollectAsync("A");

        Assert.Equal(2, report.Written);
    }

    [Fact]
    public async Task ItSaysNothingHappenedWhenNobodyWasStanding()
    {
        var report = await CollectAsync("A", "B");

        Assert.Equal(0, report.Written);
        Assert.Equal(0, report.Seen);
        Assert.Equal(2, report.StopsRead);
    }

    [Fact]
    public async Task ItSkipsTheBusesTheFeedGivesNoPositionFor()
    {
        _fleet.Carries(
            new CarrisVehicle { Id = "|undefined" },
            new CarrisVehicle { Id = "41|300", Lat = null, Lon = null },
            new CarrisVehicle
            {
                Id = "42|2548",
                Lat = 38.8,
                Lon = -9.2,
                TripId = "[X]2769_0_1",
                Timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
            });

        var report = await CollectAsync("A");

        Assert.Equal(0, report.StopsFailed);
        Assert.Single(_observer.Fleet);
        Assert.Equal("42|2548", _observer.Fleet[0].Id);
    }

    [Fact]
    public async Task ItSurvivesTheFleetBeingUnreachable()
    {
        _fleet.Break();

        var report = await CollectAsync("A");

        Assert.Equal(1, report.StopsFailed);
        Assert.Equal(0, report.Written);
    }

    public void Dispose()
    {
        _connection.Dispose();
        GC.SuppressFinalize(this);
    }

    private sealed class StubObserver : IPassageObserver
    {
        private IReadOnlyList<ArrivalObservation> _passages = [];

        public IReadOnlyList<Vehicle> Fleet { get; private set; } = [];

        public void Saw(params ArrivalObservation[] passages) => _passages = passages;

        public Task<IReadOnlyList<ArrivalObservation>> ObserveAsync(
            IReadOnlyList<Vehicle> fleet, IReadOnlySet<string> stopIds, CancellationToken cancellationToken)
        {
            Fleet = fleet;

            return Task.FromResult(_passages);
        }
    }

    private sealed class StubFleet : ICarrisClient
    {
        private bool _broken;
        private IReadOnlyList<CarrisVehicle> _buses = [];

        public void Break() => _broken = true;

        public void Carries(params CarrisVehicle[] buses) => _buses = buses;

        public Task<IReadOnlyList<CarrisVehicle>> GetVehiclesAsync(CancellationToken cancellationToken) =>
            _broken
                ? Task.FromException<IReadOnlyList<CarrisVehicle>>(new HttpRequestException("no fleet"))
                : Task.FromResult(_buses);
    }
}
