using BusLisbon.Api.Observations;
using BusLisbon.Api.Reliability;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Time.Testing;

namespace BusLisbon.Api.Tests;

public class LinePunctualityQueryTests : IDisposable
{
    private static readonly DateOnly Today = new(2026, 8, 19);

    private readonly SqliteConnection _connection = new("Filename=:memory:");
    private readonly DbContextOptions<ObservationsContext> _options;
    private readonly FakeTimeProvider _time = new(DateTimeOffset.Parse("2026-08-19T09:00:00Z"));
    private long _nextScheduled = 1_787_000_000;

    public LinePunctualityQueryTests()
    {
        _connection.Open();
        _options = new DbContextOptionsBuilder<ObservationsContext>().UseSqlite(_connection).Options;

        using var context = new ObservationsContext(_options);
        context.Database.EnsureCreated();
    }

    private async Task GivenAsync(params ArrivalObservation[] passages)
    {
        await using var context = new ObservationsContext(_options);

        context.Arrivals.AddRange(passages);
        await context.SaveChangesAsync();
    }

    private ArrivalObservation Passage(string lineId, long latenessSeconds, DateOnly? serviceDate)
    {
        var scheduled = _nextScheduled += 600;

        return new ArrivalObservation
        {
            LineId = lineId,
            StopId = "060003",
            PatternId = $"{lineId}_0_1",
            ServiceDate = serviceDate ?? Today,
            ScheduledUnix = scheduled,
            EstimatedUnix = null,
            ObservedUnix = scheduled + latenessSeconds,
        };
    }

    private ArrivalObservation[] Repeat(string lineId, long latenessSeconds, int count, DateOnly? serviceDate = null) =>
        Enumerable.Range(0, count).Select(_ => Passage(lineId, latenessSeconds, serviceDate)).ToArray();

    private async Task<IReadOnlyList<LinePunctuality>> RunAsync(ReliabilityOptions? settings = null)
    {
        await using var context = new ObservationsContext(_options);

        var query = new LinePunctualityQuery(
            context, Options.Create(settings ?? new ReliabilityOptions { MinimumPassages = 3 }), _time);

        return await query.RunAsync(CancellationToken.None);
    }

    [Fact]
    public async Task ALineWithTooFewPassagesDoesNotAppear()
    {
        await GivenAsync(Repeat("1001", 0, 2));

        Assert.Empty(await RunAsync());
    }

    [Fact]
    public async Task ItCountsPunctualLateAndEarlySeparately()
    {
        await GivenAsync([
            .. Repeat("1001", 30, 3),
            .. Repeat("1001", 600, 2),
            .. Repeat("1001", -600, 1),
        ]);

        var line = Assert.Single(await RunAsync());

        Assert.Equal(6, line.Passages);
        Assert.Equal(3, line.WithinTolerance);
        Assert.Equal(2, line.Late);
        Assert.Equal(1, line.Early);
    }

    [Fact]
    public async Task TheAverageLatenessCountsEarlyBusesAsNegative()
    {
        await GivenAsync([.. Repeat("1001", 120, 2), .. Repeat("1001", -240, 2)]);

        var line = Assert.Single(await RunAsync());

        Assert.Equal(-60, line.AverageLatenessSeconds, 3);
    }

    [Fact]
    public async Task TheMostPunctualLineComesFirst()
    {
        await GivenAsync([
            .. Repeat("sloppy", 900, 4),
            .. Repeat("decent", 60, 3),
            .. Repeat("decent", 900, 1),
            .. Repeat("perfect", 10, 4),
        ]);

        var ranked = await RunAsync();

        Assert.Equal(["perfect", "decent", "sloppy"], ranked.Select(line => line.LineId));
    }

    [Fact]
    public async Task PassagesOlderThanTheWindowAreLeftOut()
    {
        await GivenAsync([
            .. Repeat("1001", 0, 3, Today.AddDays(-40)),
            .. Repeat("1001", 0, 3, Today.AddDays(-1)),
        ]);

        var line = Assert.Single(await RunAsync(new ReliabilityOptions { MinimumPassages = 3, WindowDays = 30 }));

        Assert.Equal(3, line.Passages);
        Assert.Equal(Today.AddDays(-1), line.FirstServiceDate);
        Assert.Equal(Today.AddDays(-1), line.LastServiceDate);
    }

    [Fact]
    public async Task ItReportsTheDaysTheLineWasSeen()
    {
        await GivenAsync([
            .. Repeat("1001", 0, 2, Today.AddDays(-5)),
            .. Repeat("1001", 0, 2, Today),
        ]);

        var line = Assert.Single(await RunAsync());

        Assert.Equal(Today.AddDays(-5), line.FirstServiceDate);
        Assert.Equal(Today, line.LastServiceDate);
    }

    public void Dispose() => _connection.Dispose();
}
