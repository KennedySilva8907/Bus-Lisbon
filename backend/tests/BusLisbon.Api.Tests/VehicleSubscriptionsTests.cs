using BusLisbon.Api.Realtime;
using BusLisbon.Api.Vehicles;

namespace BusLisbon.Api.Tests;

public class VehicleSubscriptionsTests
{
    private static Vehicle Bus(double lat = 38.7856, double lon = -9.3037) =>
        new("41|300", lat, lon, "1209", "1209_1_1", "t1", 302, 8.05, 1_786_009_950);

    [Fact]
    public void ActiveTargets_IsEmptyBeforeAnybodySubscribes()
    {
        Assert.Empty(new VehicleSubscriptions().ActiveTargets());
    }

    [Fact]
    public void ActiveTargets_ListsATargetOncePerDistinctTarget()
    {
        var subscriptions = new VehicleSubscriptions();

        subscriptions.Add("conn-1", new VehicleTarget("41|300", null, null));
        subscriptions.Add("conn-2", new VehicleTarget("41|300", null, null));

        Assert.Single(subscriptions.ActiveTargets());
    }

    [Fact]
    public void RemoveConnection_KeepsATargetAliveWhileAnotherConnectionWantsIt()
    {
        var subscriptions = new VehicleSubscriptions();
        var target = new VehicleTarget("41|300", null, null);

        subscriptions.Add("conn-1", target);
        subscriptions.Add("conn-2", target);
        subscriptions.RemoveConnection("conn-1");

        Assert.Single(subscriptions.ActiveTargets());
    }

    [Fact]
    public void RemoveConnection_DropsTheTargetWhenTheLastWatcherLeaves()
    {
        var subscriptions = new VehicleSubscriptions();
        var target = new VehicleTarget("41|300", null, null);

        subscriptions.Add("conn-1", target);
        subscriptions.RemoveConnection("conn-1");

        Assert.Empty(subscriptions.ActiveTargets());
    }

    [Fact]
    public void HasChanged_IsTrueTheFirstTimeAVehicleIsSeen()
    {
        var subscriptions = new VehicleSubscriptions();

        Assert.True(subscriptions.HasChanged("vehicle:41|300", Bus()));
    }

    [Fact]
    public void HasChanged_IsFalseWhenTheBusHasNotMoved()
    {
        var subscriptions = new VehicleSubscriptions();

        subscriptions.HasChanged("vehicle:41|300", Bus());

        Assert.False(subscriptions.HasChanged("vehicle:41|300", Bus()));
    }

    [Fact]
    public void HasChanged_IsTrueOnceTheBusMoves()
    {
        var subscriptions = new VehicleSubscriptions();

        subscriptions.HasChanged("vehicle:41|300", Bus());

        Assert.True(subscriptions.HasChanged("vehicle:41|300", Bus(lat: 38.79)));
    }

    [Fact]
    public void Forget_MakesTheNextSightingCountAsAChange()
    {
        var subscriptions = new VehicleSubscriptions();

        subscriptions.HasChanged("vehicle:41|300", Bus());
        subscriptions.Forget("vehicle:41|300");

        Assert.True(subscriptions.HasChanged("vehicle:41|300", Bus()));
    }
}
