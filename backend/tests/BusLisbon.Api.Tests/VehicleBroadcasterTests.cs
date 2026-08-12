using BusLisbon.Api.Carris;
using BusLisbon.Api.Endpoints;
using BusLisbon.Api.Realtime;
using BusLisbon.Api.Vehicles;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Time.Testing;

namespace BusLisbon.Api.Tests;

public class VehicleBroadcasterTests
{
    private static readonly DateTimeOffset Start = DateTimeOffset.FromUnixTimeSeconds(1_786_010_000);

    private sealed class RecordingSender : IVehicleSender
    {
        public List<(string Group, VehicleResponse Payload)> Sent { get; } = [];

        public Task SendAsync(string group, VehicleResponse payload, CancellationToken cancellationToken)
        {
            Sent.Add((group, payload));

            return Task.CompletedTask;
        }
    }

    private sealed class StubCarrisClient(Func<IReadOnlyList<CarrisVehicle>> respond) : ICarrisClient
    {
        public Task<IReadOnlyList<CarrisVehicle>> GetVehiclesAsync(CancellationToken cancellationToken) =>
            Task.FromResult(respond());
    }

    private static CarrisVehicle Wire(string id, double lat, long timestamp) => new()
    {
        Id = id,
        Lat = lat,
        Lon = -9.3037,
        LineId = "1209",
        PatternId = "1209_1_1",
        TripId = "t1",
        Bearing = 302,
        Speed = 8.05,
        Timestamp = timestamp
    };

    private static (VehicleBroadcaster Broadcaster, VehicleSubscriptions Subs, RecordingSender Sender, FakeTimeProvider Time)
        Build(Func<IReadOnlyList<CarrisVehicle>> respond)
    {
        var time = new FakeTimeProvider(Start);
        var options = Options.Create(new CarrisOptions());
        var gateway = new VehicleGateway(new StubCarrisClient(respond), time, options,
            NullLogger<VehicleGateway>.Instance);
        var subscriptions = new VehicleSubscriptions();
        var sender = new RecordingSender();
        var broadcaster = new VehicleBroadcaster(gateway, subscriptions, sender,
            NullLogger<VehicleBroadcaster>.Instance);

        return (broadcaster, subscriptions, sender, time);
    }

    [Fact]
    public async Task PublishChangesAsync_SendsNothingWhenNobodyIsSubscribed()
    {
        var (broadcaster, _, sender, _) = Build(() => [Wire("41|300", 38.78, Start.ToUnixTimeSeconds())]);

        await broadcaster.PublishChangesAsync(CancellationToken.None);

        Assert.Empty(sender.Sent);
    }

    [Fact]
    public async Task PublishChangesAsync_SendsTheVehicleToItsGroup()
    {
        var (broadcaster, subs, sender, _) = Build(() => [Wire("41|300", 38.78, Start.ToUnixTimeSeconds())]);

        subs.Add("conn-1", new VehicleTarget("41|300", null, null));

        await broadcaster.PublishChangesAsync(CancellationToken.None);

        var sent = Assert.Single(sender.Sent);
        Assert.Equal("vehicle:41|300", sent.Group);
        Assert.Equal("41|300", sent.Payload.Vehicle.Id);
    }

    [Fact]
    public async Task PublishChangesAsync_SendsNothingSecondTimeWhenTheBusHasNotMoved()
    {
        var lat = 38.78;
        var (broadcaster, subs, sender, time) = Build(() => [Wire("41|300", lat, Start.ToUnixTimeSeconds())]);

        subs.Add("conn-1", new VehicleTarget("41|300", null, null));

        await broadcaster.PublishChangesAsync(CancellationToken.None);
        time.Advance(TimeSpan.FromSeconds(9));
        await broadcaster.PublishChangesAsync(CancellationToken.None);

        Assert.Single(sender.Sent);
    }

    [Fact]
    public async Task PublishChangesAsync_SendsAgainOnceTheBusMoves()
    {
        var lat = 38.78;
        var (broadcaster, subs, sender, time) = Build(() => [Wire("41|300", lat, Start.ToUnixTimeSeconds())]);

        subs.Add("conn-1", new VehicleTarget("41|300", null, null));

        await broadcaster.PublishChangesAsync(CancellationToken.None);
        lat = 38.79;
        time.Advance(TimeSpan.FromSeconds(9));
        await broadcaster.PublishChangesAsync(CancellationToken.None);

        Assert.Equal(2, sender.Sent.Count);
    }

    [Fact]
    public async Task PublishChangesAsync_ResolvesALineTargetToWhoeverIsOnItNow()
    {
        var (broadcaster, subs, sender, _) = Build(() => [Wire("41|733", 38.78, Start.ToUnixTimeSeconds())]);

        subs.Add("conn-1", new VehicleTarget(null, "1209", "1209_1_1"));

        await broadcaster.PublishChangesAsync(CancellationToken.None);

        var sent = Assert.Single(sender.Sent);
        Assert.Equal("line:1209|1209_1_1", sent.Group);
        Assert.Equal("41|733", sent.Payload.Vehicle.Id);
    }

    [Fact]
    public async Task PublishChangesAsync_SendsNothingForATargetWithNoVehicle()
    {
        var (broadcaster, subs, sender, _) = Build(() => []);

        subs.Add("conn-1", new VehicleTarget("41|300", null, null));

        await broadcaster.PublishChangesAsync(CancellationToken.None);

        Assert.Empty(sender.Sent);
    }
}
