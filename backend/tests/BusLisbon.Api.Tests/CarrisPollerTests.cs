using BusLisbon.Api.Carris;
using BusLisbon.Api.Vehicles;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Time.Testing;

namespace BusLisbon.Api.Tests;

public class CarrisPollerTests
{
    private static readonly DateTimeOffset Start = DateTimeOffset.FromUnixTimeSeconds(1_786_010_000);

    [Fact]
    public void IsActive_IsFalseBeforeAnybodyAsks()
    {
        var demand = new VehicleDemand(new FakeTimeProvider(Start), Options.Create(new CarrisOptions()));

        Assert.False(demand.IsActive());
    }

    [Fact]
    public void IsActive_IsTrueRightAfterARequest()
    {
        var demand = new VehicleDemand(new FakeTimeProvider(Start), Options.Create(new CarrisOptions()));

        demand.Register();

        Assert.True(demand.IsActive());
    }

    [Fact]
    public void IsActive_StaysTrueInsideTheWindow()
    {
        var time = new FakeTimeProvider(Start);
        var demand = new VehicleDemand(time, Options.Create(new CarrisOptions()));

        demand.Register();
        time.Advance(TimeSpan.FromSeconds(59));

        Assert.True(demand.IsActive());
    }

    [Fact]
    public void IsActive_GoesFalseOnceTheWindowHasPassed()
    {
        var time = new FakeTimeProvider(Start);
        var demand = new VehicleDemand(time, Options.Create(new CarrisOptions()));

        demand.Register();
        time.Advance(TimeSpan.FromSeconds(61));

        Assert.False(demand.IsActive());
    }

    [Fact]
    public void IsActive_IsTrueWhileASubscriberIsConnectedNoMatterHowLong()
    {
        var time = new FakeTimeProvider(Start);
        var demand = new VehicleDemand(time, Options.Create(new CarrisOptions()));

        demand.AddSubscriber();
        time.Advance(TimeSpan.FromHours(1));

        Assert.True(demand.IsActive());
    }

    [Fact]
    public void IsActive_StaysTrueWhileOneOfTwoSubscribersRemains()
    {
        var demand = new VehicleDemand(new FakeTimeProvider(Start), Options.Create(new CarrisOptions()));

        demand.AddSubscriber();
        demand.AddSubscriber();
        demand.RemoveSubscriber();

        Assert.True(demand.IsActive());
    }

    [Fact]
    public void IsActive_GoesFalseWhenTheLastSubscriberLeaves()
    {
        var demand = new VehicleDemand(new FakeTimeProvider(Start), Options.Create(new CarrisOptions()));

        demand.AddSubscriber();
        demand.RemoveSubscriber();

        Assert.False(demand.IsActive());
    }

    [Fact]
    public async Task PollOnceAsync_DoesNotTouchCarrisWhileNobodyIsWatching()
    {
        var (poller, client, _, _) = Build();

        await poller.PollOnceAsync(CancellationToken.None);

        Assert.Equal(0, client.Calls);
    }

    [Fact]
    public async Task PollOnceAsync_FetchesWhileSomebodyIsWatching()
    {
        var (poller, client, _, demand) = Build();

        demand.Register();

        await poller.PollOnceAsync(CancellationToken.None);

        Assert.Equal(1, client.Calls);
    }

    private static (CarrisPoller Poller, CountingCarrisClient Client, FakeTimeProvider Time, VehicleDemand Demand) Build()
    {
        var time = new FakeTimeProvider(Start);
        var options = Options.Create(new CarrisOptions());
        var client = new CountingCarrisClient();
        var demand = new VehicleDemand(time, options);
        var gateway = new VehicleGateway(client, time, options, NullLogger<VehicleGateway>.Instance);
        var poller = new CarrisPoller(gateway, demand, time, options, NullLogger<CarrisPoller>.Instance);

        return (poller, client, time, demand);
    }

    private sealed class CountingCarrisClient : ICarrisClient
    {
        private int _calls;

        public int Calls => Volatile.Read(ref _calls);

        public Task<IReadOnlyList<CarrisVehicle>> GetVehiclesAsync(CancellationToken cancellationToken)
        {
            Interlocked.Increment(ref _calls);

            return Task.FromResult<IReadOnlyList<CarrisVehicle>>([]);
        }
    }
}
