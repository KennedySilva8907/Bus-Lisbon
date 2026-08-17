using BusLisbon.Api.Alerts;
using BusLisbon.Api.Carris;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Time.Testing;

namespace BusLisbon.Api.Tests;

public class AlertCheckerTests
{
    private const string Endpoint = "https://push.example/abc";

    private readonly FakeKeyValueStore _kv = new();
    private readonly FakeTimeProvider _time = new(DateTimeOffset.Parse("2026-08-17T09:00:00Z"));
    private readonly StubArrivals _arrivals = new();
    private readonly RecordingNotifier _notifier = new();
    private readonly AlertStore _store;
    private readonly AlertChecker _checker;

    public AlertCheckerTests()
    {
        _store = new AlertStore(_kv, _time);
        _checker = new AlertChecker(
            _store, _arrivals, _notifier, _time, NullLogger<AlertChecker>.Instance);
    }

    private async Task<Alert> PendingAsync(
        string stopId = "060003", string vehicleId = "41|814", int threshold = 10,
        string endpoint = Endpoint, bool withSubscription = true)
    {
        var alert = _store.NewAlert(endpoint, vehicleId, "1235", "1235_0_2", stopId, "Cascais", threshold);

        await _store.AddAsync(
            alert,
            new PushSubscription(endpoint, new PushSubscriptionKeys("p256dh", "auth")),
            CancellationToken.None);

        if (!withSubscription)
        {
            await _store.ForgetSubscriptionAsync(endpoint, CancellationToken.None);
        }

        return alert;
    }

    private CarrisArrival Arrival(double minutesAway, string vehicleId = "41|814") => new()
    {
        VehicleId = vehicleId,
        LineId = "1235",
        PatternId = "1235_0_2",
        EstimatedArrivalUnix = _time.GetUtcNow().AddMinutes(minutesAway).ToUnixTimeSeconds(),
        ScheduledArrivalUnix = _time.GetUtcNow().AddMinutes(minutesAway).ToUnixTimeSeconds()
    };

    [Fact]
    public async Task NothingPendingIsNoWork()
    {
        var report = await _checker.CheckOnceAsync(CancellationToken.None);

        Assert.Equal(new AlertCheckReport(0, 0, 0, 0), report);
        Assert.Empty(_notifier.Sent);
    }

    [Fact]
    public async Task ABusInsideTheThresholdIsNotifiedAndRetired()
    {
        var alert = await PendingAsync(threshold: 10);
        _arrivals.For("060003", Arrival(6));

        var report = await _checker.CheckOnceAsync(CancellationToken.None);

        Assert.Equal(1, report.Fired);
        Assert.Single(_notifier.Sent);
        Assert.Equal(6, _notifier.Sent[0].Minutes);

        var stored = await _store.GetAsync(alert.Id, CancellationToken.None);
        Assert.Equal(AlertStatus.Fired, stored!.Status);
        Assert.Empty(await _store.ListPendingAsync(CancellationToken.None));
    }

    [Fact]
    public async Task ABusStillFarAwayIsLeftPending()
    {
        await PendingAsync(threshold: 5);
        _arrivals.For("060003", Arrival(30));

        var report = await _checker.CheckOnceAsync(CancellationToken.None);

        Assert.Equal(0, report.Fired);
        Assert.Empty(_notifier.Sent);
        Assert.Single(await _store.ListPendingAsync(CancellationToken.None));
    }

    [Fact]
    public async Task TenAlertsOnOneStopCostOneCallToCarris()
    {
        for (var i = 0; i < 10; i++)
        {
            await PendingAsync(vehicleId: $"41|{i}", threshold: 30);
        }

        _arrivals.For("060003", Arrival(45));

        await _checker.CheckOnceAsync(CancellationToken.None);

        Assert.Equal(1, _arrivals.CallsFor("060003"));
    }

    [Fact]
    public async Task AStopThatFailsDoesNotStopTheOthers()
    {
        await PendingAsync(stopId: "broken", vehicleId: "41|1");
        await PendingAsync(stopId: "060003", vehicleId: "41|814", threshold: 10);
        _arrivals.Fail("broken");
        _arrivals.For("060003", Arrival(4));

        var report = await _checker.CheckOnceAsync(CancellationToken.None);

        Assert.Equal(1, report.StopsFailed);
        Assert.Equal(1, report.Fired);
        Assert.Single(_notifier.Sent);
    }

    [Fact]
    public async Task AFailedSendLeavesTheAlertPending()
    {
        var alert = await PendingAsync(threshold: 10);
        _arrivals.For("060003", Arrival(5));
        _notifier.Answer = PushResult.Failed;

        var report = await _checker.CheckOnceAsync(CancellationToken.None);

        Assert.Equal(0, report.Fired);

        var stored = await _store.GetAsync(alert.Id, CancellationToken.None);
        Assert.Equal(AlertStatus.Pending, stored!.Status);
        Assert.Single(await _store.ListPendingAsync(CancellationToken.None));
    }

    [Fact]
    public async Task ADeviceThatThrewAwayItsSubscriptionIsForgotten()
    {
        var alert = await PendingAsync(threshold: 10);
        _arrivals.For("060003", Arrival(5));
        _notifier.Answer = PushResult.SubscriptionGone;

        await _checker.CheckOnceAsync(CancellationToken.None);

        Assert.Null(await _store.GetSubscriptionAsync(Endpoint, CancellationToken.None));

        var stored = await _store.GetAsync(alert.Id, CancellationToken.None);
        Assert.Equal(AlertStatus.Expired, stored!.Status);
    }

    [Fact]
    public async Task AnAlertWithNoSubscriptionIsNotReportedAsFired()
    {
        await PendingAsync(threshold: 10, withSubscription: false);
        _arrivals.For("060003", Arrival(5));

        var report = await _checker.CheckOnceAsync(CancellationToken.None);

        Assert.Equal(0, report.Fired);
        Assert.Equal(1, report.Expired);
        Assert.Empty(_notifier.Sent);
    }

    [Fact]
    public async Task ABusMissingFromTheFeedRaisesItsMissCount()
    {
        var alert = await PendingAsync();
        _arrivals.For("060003", Arrival(5, vehicleId: "41|999"));

        await _checker.CheckOnceAsync(CancellationToken.None);

        var stored = await _store.GetAsync(alert.Id, CancellationToken.None);

        Assert.Equal(1, stored!.MissCount);
        Assert.Equal(AlertStatus.Pending, stored.Status);
    }

    [Fact]
    public async Task TheFifthMissRetiresTheAlert()
    {
        var alert = await PendingAsync();
        _arrivals.For("060003");

        for (var pass = 0; pass < AlertDecider.MaxMisses; pass++)
        {
            await _checker.CheckOnceAsync(CancellationToken.None);
        }

        var stored = await _store.GetAsync(alert.Id, CancellationToken.None);

        Assert.Equal(AlertStatus.Expired, stored!.Status);
        Assert.Empty(await _store.ListPendingAsync(CancellationToken.None));
    }

    private sealed class StubArrivals : ICarrisArrivals
    {
        private readonly Dictionary<string, IReadOnlyList<CarrisArrival>> _byStop = [];
        private readonly HashSet<string> _broken = [];
        private readonly Dictionary<string, int> _calls = [];

        public void For(string stopId, params CarrisArrival[] arrivals) => _byStop[stopId] = arrivals;

        public void Fail(string stopId) => _broken.Add(stopId);

        public int CallsFor(string stopId) => _calls.GetValueOrDefault(stopId);

        public Task<IReadOnlyList<CarrisArrival>> GetArrivalsAsync(
            string stopId, CancellationToken cancellationToken)
        {
            _calls[stopId] = _calls.GetValueOrDefault(stopId) + 1;

            if (_broken.Contains(stopId))
            {
                throw new CarrisFeedException($"stop {stopId} is broken");
            }

            return Task.FromResult(_byStop.GetValueOrDefault(stopId, []));
        }
    }

    private sealed class RecordingNotifier : IAlertNotifier
    {
        public PushResult Answer { get; set; } = PushResult.Sent;

        public List<(Alert Alert, int Minutes)> Sent { get; } = [];

        public Task<PushResult> SendAsync(
            Alert alert, int minutesToShow, PushSubscription subscription, CancellationToken cancellationToken)
        {
            if (Answer == PushResult.Sent)
            {
                Sent.Add((alert, minutesToShow));
            }

            return Task.FromResult(Answer);
        }
    }
}
