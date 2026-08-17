using BusLisbon.Api.Alerts;
using Microsoft.Extensions.Time.Testing;

namespace BusLisbon.Api.Tests;

public class AlertStoreTests
{
    private const string Endpoint = "https://push.example/abc";

    private readonly FakeKeyValueStore _kv = new();
    private readonly FakeTimeProvider _time = new(DateTimeOffset.Parse("2026-08-16T20:00:00Z"));
    private readonly AlertStore _store;

    public AlertStoreTests() => _store = new AlertStore(_kv, _time);

    private static PushSubscription Subscription(string endpoint = Endpoint) =>
        new(endpoint, new PushSubscriptionKeys("p256dh", "auth"));

    private async Task<Alert> AddPendingAsync(
        string vehicleId = "41|814", string stopId = "060003", int threshold = 10)
    {
        var alert = _store.NewAlert(Endpoint, vehicleId, "1235", "1235_0_2", stopId, "Cascais", threshold);

        await _store.AddAsync(alert, Subscription(), CancellationToken.None);

        return alert;
    }

    [Fact]
    public async Task AnAddedAlertComesBackWithEverythingItWasGiven()
    {
        var alert = await AddPendingAsync();

        var stored = await _store.GetAsync(alert.Id, CancellationToken.None);

        Assert.Equal(alert, stored);
        Assert.Equal(AlertStatus.Pending, stored!.Status);
        Assert.Equal(_time.GetUtcNow().ToUnixTimeMilliseconds(), stored.CreatedAt);
    }

    [Fact]
    public async Task AnAddedAlertIsListedForItsDeviceAndForTheChecker()
    {
        var alert = await AddPendingAsync();

        var mine = await _store.ListByEndpointAsync(Endpoint, CancellationToken.None);
        var pending = await _store.ListPendingAsync(CancellationToken.None);

        Assert.Equal([alert], mine);
        Assert.Equal([alert], pending);
    }

    [Fact]
    public async Task RetiringAnAlertTakesItOutOfBothSets()
    {
        var alert = await AddPendingAsync();

        await _store.RetireAsync(alert, AlertStatus.Fired, CancellationToken.None);

        Assert.Empty(_kv.Members(AlertKeys.EndpointAlerts(Endpoint)));
        Assert.Empty(_kv.Members(AlertKeys.Pending));
    }

    [Fact]
    public async Task ARetiredAlertStopsBeingListedButStaysReadableForADay()
    {
        var alert = await AddPendingAsync();

        var retired = await _store.RetireAsync(alert, AlertStatus.Fired, CancellationToken.None);

        Assert.Empty(await _store.ListByEndpointAsync(Endpoint, CancellationToken.None));
        Assert.Equal(AlertStatus.Fired, retired.Status);
        Assert.Equal(retired, await _store.GetAsync(alert.Id, CancellationToken.None));
        Assert.Equal(AlertStore.TerminalRetention, _kv.Expiries[AlertKeys.Alert(alert.Id)]);
    }

    [Fact]
    public async Task AHundredRetiredAlertsLeaveNothingBehindForTheHundredAndFirst()
    {
        for (var i = 0; i < 100; i++)
        {
            var previous = await AddPendingAsync(vehicleId: $"41|{i}");
            await _store.RetireAsync(previous, AlertStatus.Fired, CancellationToken.None);
        }

        await AddPendingAsync(vehicleId: "41|999");

        Assert.Single(_kv.Members(AlertKeys.EndpointAlerts(Endpoint)));
    }

    [Fact]
    public async Task CancellingAnAlertRemovesItCompletely()
    {
        var alert = await AddPendingAsync();

        await _store.RemoveAsync(alert, CancellationToken.None);

        Assert.Null(await _store.GetAsync(alert.Id, CancellationToken.None));
        Assert.Empty(_kv.Members(AlertKeys.EndpointAlerts(Endpoint)));
        Assert.Empty(_kv.Members(AlertKeys.Pending));
    }

    [Fact]
    public async Task TheSameAlertAskedForTwiceIsRecognised()
    {
        var alert = await AddPendingAsync(stopId: "060003", threshold: 10);

        var found = await _store.FindPendingMatchAsync(
            Endpoint, alert.VehicleId, "060003", 10, CancellationToken.None);

        Assert.Equal(alert, found);
    }

    [Fact]
    public async Task ADifferentThresholdIsADifferentAlert()
    {
        var alert = await AddPendingAsync(threshold: 10);

        var found = await _store.FindPendingMatchAsync(
            Endpoint, alert.VehicleId, alert.StopId, 5, CancellationToken.None);

        Assert.Null(found);
    }

    [Fact]
    public async Task AnAlertThatAlreadyFiredDoesNotBlockAskingAgain()
    {
        var alert = await AddPendingAsync();
        await _store.RetireAsync(alert, AlertStatus.Fired, CancellationToken.None);

        var found = await _store.FindPendingMatchAsync(
            Endpoint, alert.VehicleId, alert.StopId, alert.ThresholdMinutes,
            CancellationToken.None);

        Assert.Null(found);
    }

    [Fact]
    public async Task TheSubscriptionIsKeptWithAnExpirySoDeadDevicesFallAway()
    {
        await AddPendingAsync();

        var subscription = await _store.GetSubscriptionAsync(
            Endpoint, CancellationToken.None);

        Assert.Equal(Subscription(), subscription);
        Assert.Equal(AlertStore.SubscriptionRetention, _kv.Expiries[AlertKeys.Subscription(Endpoint)]);
    }

    [Fact]
    public async Task AMissCountSurvivesAnUpdate()
    {
        var alert = await AddPendingAsync();

        await _store.UpdateAsync(alert with { MissCount = 3 }, CancellationToken.None);

        var stored = await _store.GetAsync(alert.Id, CancellationToken.None);

        Assert.Equal(3, stored!.MissCount);
        Assert.True(stored.IsPending);
    }
}
