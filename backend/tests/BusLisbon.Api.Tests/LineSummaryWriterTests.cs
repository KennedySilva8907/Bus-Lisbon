using BusLisbon.Api.Observations;
using BusLisbon.Api.Reliability;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Time.Testing;

namespace BusLisbon.Api.Tests;

public class LineSummaryWriterTests : IDisposable
{
    private static readonly DateOnly Today = new(2026, 8, 19);

    private readonly SqliteConnection _connection = new("Filename=:memory:");
    private readonly DbContextOptions<ObservationsContext> _options;
    private readonly FakeTimeProvider _time = new(DateTimeOffset.Parse("2026-08-19T09:00:00Z"));
    private long _nextScheduled = 1_787_000_000;

    public LineSummaryWriterTests()
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

    private ArrivalObservation[] Repeat(string lineId, long latenessSeconds, int count, DateOnly? serviceDate = null) =>
        Enumerable.Range(0, count).Select(_ =>
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
        }).ToArray();

    private async Task<SummaryReport> RewriteAsync()
    {
        await using var context = new ObservationsContext(_options);
        var settings = Options.Create(new ReliabilityOptions { MinimumPassages = 3 });

        var writer = new LineSummaryWriter(
            context, new LinePunctualityQuery(context, settings, _time), _time);

        return await writer.RewriteAsync(CancellationToken.None);
    }

    private async Task<List<LineReliability>> StoredAsync()
    {
        await using var context = new ObservationsContext(_options);

        return await context.LineReliability.OrderBy(line => line.LineId).ToListAsync();
    }

    [Fact]
    public async Task ItStoresOneRowPerQualifyingLine()
    {
        await GivenAsync([.. Repeat("1001", 30, 4), .. Repeat("1002", 600, 3), .. Repeat("1003", 0, 1)]);

        var report = await RewriteAsync();
        var stored = await StoredAsync();

        Assert.Equal(2, report.Lines);
        Assert.Equal(["1001", "1002"], stored.Select(line => line.LineId));
        Assert.Equal(4, stored[0].Passages);
        Assert.Equal(4, stored[0].WithinTolerance);
        Assert.Equal(3, stored[1].Late);
    }

    [Fact]
    public async Task RunningItTwiceDoesNotDuplicate()
    {
        await GivenAsync(Repeat("1001", 30, 4));

        await RewriteAsync();
        await RewriteAsync();

        Assert.Single(await StoredAsync());
    }

    [Fact]
    public async Task ALineThatFallsOutOfTheWindowIsRemoved()
    {
        await GivenAsync(Repeat("1001", 30, 4));

        await RewriteAsync();
        Assert.Single(await StoredAsync());

        _time.Advance(TimeSpan.FromDays(40));
        await RewriteAsync();

        Assert.Empty(await StoredAsync());
    }

    [Fact]
    public async Task ItRecordsWhenTheSummaryWasComputed()
    {
        await GivenAsync(Repeat("1001", 30, 4));

        await RewriteAsync();

        Assert.Equal(_time.GetUtcNow().ToUnixTimeSeconds(), (await StoredAsync())[0].ComputedAtUnix);
    }

    public void Dispose() => _connection.Dispose();
}
