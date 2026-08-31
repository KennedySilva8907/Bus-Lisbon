using BusLisbon.Api.Observations;
using Microsoft.Extensions.Time.Testing;

namespace BusLisbon.Api.Tests;

public class ObservationBufferTests
{
    private static readonly DateTimeOffset Morning = new(2026, 9, 1, 6, 0, 0, TimeSpan.Zero);

    private readonly FakeKeyValueStore _store = new();
    private readonly FakeTimeProvider _clock = new(Morning);

    private ObservationBuffer Buffer() => new(_store, _clock);

    private static ArrivalObservation Passage(
        string line = "2769", string stop = "110591", long scheduled = 1000, long observed = 1010) =>
        new()
        {
            LineId = line,
            StopId = stop,
            ServiceDate = new DateOnly(2026, 9, 1),
            ScheduledUnix = scheduled,
            ObservedUnix = observed,
        };

    [Fact]
    public async Task HoldsWhatItSawWithoutTouchingTheDatabase()
    {
        await Buffer().KeepAsync([Passage()], CancellationToken.None);

        var pending = await Buffer().PendingAsync(CancellationToken.None);

        Assert.Single(pending.Passages);
        Assert.Single(pending.Batches);
    }

    [Fact]
    public async Task KeepsWhatSeveralRunsSaw()
    {
        var buffer = Buffer();

        await buffer.KeepAsync([Passage(scheduled: 1000)], CancellationToken.None);
        _clock.Advance(TimeSpan.FromMinutes(15));
        await buffer.KeepAsync([Passage(scheduled: 2000)], CancellationToken.None);

        var pending = await buffer.PendingAsync(CancellationToken.None);

        Assert.Equal(2, pending.Passages.Count);
        Assert.Equal(2, pending.Batches.Count);
    }

    [Fact]
    public async Task WritesNothingDownWhenItSawNothing()
    {
        await Buffer().KeepAsync([], CancellationToken.None);

        Assert.Empty((await Buffer().PendingAsync(CancellationToken.None)).Batches);
    }

    [Fact]
    public async Task ABusStandingAtAStopAcrossRunsCountsOnce()
    {
        var buffer = Buffer();

        await buffer.KeepAsync([Passage(observed: 1010)], CancellationToken.None);
        _clock.Advance(TimeSpan.FromMinutes(15));
        await buffer.KeepAsync([Passage(observed: 1900)], CancellationToken.None);

        var pending = await buffer.PendingAsync(CancellationToken.None);

        Assert.Single(pending.Passages);
        Assert.Equal(1010, pending.Passages[0].ObservedUnix);
    }

    [Fact]
    public async Task TheFirstRunEverHasNothingToWaitFor()
    {
        Assert.True(await Buffer().DueForWritingAsync(CancellationToken.None));
    }

    [Fact]
    public async Task HoldsOffRightAfterATry()
    {
        var buffer = Buffer();

        await buffer.AttemptedAsync(CancellationToken.None);
        _clock.Advance(TimeSpan.FromHours(6));

        Assert.False(await buffer.DueForWritingAsync(CancellationToken.None));
    }

    [Fact]
    public async Task ComesRoundAgainADayLater()
    {
        var buffer = Buffer();

        await buffer.AttemptedAsync(CancellationToken.None);
        _clock.Advance(ObservationBuffer.BetweenWrites);

        Assert.True(await buffer.DueForWritingAsync(CancellationToken.None));
    }

    [Fact]
    public async Task WhatIsForgottenIsGone()
    {
        var buffer = Buffer();

        await buffer.KeepAsync([Passage()], CancellationToken.None);

        var pending = await buffer.PendingAsync(CancellationToken.None);

        await buffer.ForgetAsync(pending.Batches, CancellationToken.None);

        var after = await buffer.PendingAsync(CancellationToken.None);

        Assert.Empty(after.Passages);
        Assert.Empty(after.Batches);
    }

    [Fact]
    public async Task BacksOffEvenWhenTheWriteNeverSucceeds()
    {
        var buffer = Buffer();

        await buffer.AttemptedAsync(CancellationToken.None);
        _clock.Advance(TimeSpan.FromMinutes(15));

        Assert.False(await buffer.DueForWritingAsync(CancellationToken.None));
    }

    [Fact]
    public async Task NothingIsLostWhenTheWriteFailsBeforeTheForgetting()
    {
        var buffer = Buffer();

        await buffer.KeepAsync([Passage()], CancellationToken.None);
        await buffer.PendingAsync(CancellationToken.None);

        Assert.Single((await buffer.PendingAsync(CancellationToken.None)).Passages);
    }
}
