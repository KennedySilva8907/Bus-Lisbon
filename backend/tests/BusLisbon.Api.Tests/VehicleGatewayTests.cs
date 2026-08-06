using BusLisbon.Api.Carris;
using BusLisbon.Api.Vehicles;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Time.Testing;

namespace BusLisbon.Api.Tests;

public class VehicleGatewayTests
{
    private static readonly DateTimeOffset Start = DateTimeOffset.FromUnixTimeSeconds(1_786_010_000);

    private sealed class StubCarrisClient : ICarrisClient
    {
        private readonly Func<IReadOnlyList<CarrisVehicle>> _respond;

        public StubCarrisClient(Func<IReadOnlyList<CarrisVehicle>> respond) => _respond = respond;

        public int Calls { get; private set; }

        public Task<IReadOnlyList<CarrisVehicle>> GetVehiclesAsync(CancellationToken cancellationToken)
        {
            Calls++;
            return Task.FromResult(_respond());
        }
    }

    private static CarrisVehicle Wire(string id, long timestamp) => new()
    {
        Id = id,
        Lat = 38.7856,
        Lon = -9.3037,
        LineId = "1209",
        PatternId = "1209_1_1",
        TripId = "t1",
        Bearing = 302,
        Speed = 8.05,
        Timestamp = timestamp
    };

    private static (VehicleGateway Gateway, StubCarrisClient Client, FakeTimeProvider Time) Build(
        Func<IReadOnlyList<CarrisVehicle>> respond)
    {
        var time = new FakeTimeProvider(Start);
        var client = new StubCarrisClient(respond);
        var options = Options.Create(new CarrisOptions());
        var gateway = new VehicleGateway(client, time, options, NullLogger<VehicleGateway>.Instance);

        return (gateway, client, time);
    }

    [Fact]
    public async Task GetVehicleAsync_FetchesOnTheFirstLookupWhenTheCacheIsEmpty()
    {
        var (gateway, client, _) = Build(() => [Wire("41|300", Start.ToUnixTimeSeconds())]);

        var vehicle = await gateway.GetVehicleAsync("41|300", CancellationToken.None);

        Assert.NotNull(vehicle);
        Assert.Equal(1, client.Calls);
    }

    [Fact]
    public async Task GetVehicleAsync_DropsVehiclesThatFailTheLiveFilter()
    {
        var (gateway, _, _) = Build(() => [new CarrisVehicle { Id = "|undefined" }]);

        var vehicle = await gateway.GetVehicleAsync("|undefined", CancellationToken.None);

        Assert.Null(vehicle);
    }

    [Fact]
    public async Task GetVehicleAsync_ServesTheCacheWithinThePollInterval()
    {
        var (gateway, client, time) = Build(() => [Wire("41|300", Start.ToUnixTimeSeconds())]);

        await gateway.GetVehicleAsync("41|300", CancellationToken.None);
        time.Advance(TimeSpan.FromSeconds(3));
        await gateway.GetVehicleAsync("41|300", CancellationToken.None);

        Assert.Equal(1, client.Calls);
    }

    [Fact]
    public async Task GetVehicleAsync_RefetchesOnceTheSnapshotIsOlderThanThePollInterval()
    {
        var (gateway, client, time) = Build(() => [Wire("41|300", Start.ToUnixTimeSeconds())]);

        await gateway.GetVehicleAsync("41|300", CancellationToken.None);
        time.Advance(TimeSpan.FromSeconds(9));
        await gateway.GetVehicleAsync("41|300", CancellationToken.None);

        Assert.Equal(2, client.Calls);
    }

    [Fact]
    public async Task GetVehicleAsync_CollapsesConcurrentLookupsIntoOneFetch()
    {
        var gate = new TaskCompletionSource();
        var time = new FakeTimeProvider(Start);
        var calls = 0;
        var client = new BlockingCarrisClient(gate.Task, () => Interlocked.Increment(ref calls));
        var gateway = new VehicleGateway(client, time, Options.Create(new CarrisOptions()),
            NullLogger<VehicleGateway>.Instance);

        var lookups = Enumerable.Range(0, 20)
            .Select(_ => gateway.GetVehicleAsync("41|300", CancellationToken.None))
            .ToArray();

        gate.SetResult();
        await Task.WhenAll(lookups);

        Assert.Equal(1, calls);
        Assert.All(lookups, lookup => Assert.NotNull(lookup.Result));
    }

    [Fact]
    public async Task GetVehicleAsync_KeepsServingTheLastGoodSnapshotWhenTheFeedFails()
    {
        var fail = false;
        var (gateway, _, time) = Build(() => fail
            ? throw new CarrisFeedException("upstream down")
            : [Wire("41|300", Start.ToUnixTimeSeconds())]);

        await gateway.GetVehicleAsync("41|300", CancellationToken.None);
        fail = true;
        time.Advance(TimeSpan.FromSeconds(9));

        var vehicle = await gateway.GetVehicleAsync("41|300", CancellationToken.None);

        Assert.NotNull(vehicle);
    }

    [Fact]
    public async Task GetStatusAsync_ReportsTheAgeAndMarksAStaleSnapshot()
    {
        var (gateway, _, time) = Build(() => [Wire("41|300", Start.ToUnixTimeSeconds())]);

        await gateway.GetVehicleAsync("41|300", CancellationToken.None);
        var fresh = await gateway.GetStatusAsync(CancellationToken.None);

        Assert.Equal(1, fresh.LiveVehicles);
        Assert.False(fresh.Stale);
        Assert.NotNull(fresh.AgeSeconds);
        Assert.Equal(0d, fresh.AgeSeconds!.Value);
    }

    [Fact]
    public async Task RefreshAsync_ReplacesTheSnapshotWithoutALookup()
    {
        var (gateway, client, _) = Build(() => [Wire("41|300", Start.ToUnixTimeSeconds())]);

        await gateway.RefreshAsync(CancellationToken.None);

        Assert.Equal(1, client.Calls);
        var status = await gateway.GetStatusAsync(CancellationToken.None);
        Assert.Equal(1, status.LiveVehicles);
    }

    private sealed class BlockingCarrisClient(Task gate, Action onCall) : ICarrisClient
    {
        public async Task<IReadOnlyList<CarrisVehicle>> GetVehiclesAsync(CancellationToken cancellationToken)
        {
            onCall();
            await gate;
            return [Wire("41|300", Start.ToUnixTimeSeconds())];
        }
    }
}
