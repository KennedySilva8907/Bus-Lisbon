namespace BusLisbon.Api.Alerts;

public sealed class AlertStore(IKeyValueStore store, TimeProvider time)
{
    public static readonly TimeSpan TerminalRetention = TimeSpan.FromHours(24);
    public static readonly TimeSpan SubscriptionRetention = TimeSpan.FromDays(90);

    public async Task<Alert?> GetAsync(string id, CancellationToken cancellationToken) =>
        await store.GetAsync<Alert>(AlertKeys.Alert(id), cancellationToken);

    public async Task<IReadOnlyList<Alert>> ListByEndpointAsync(
        string endpoint, CancellationToken cancellationToken)
    {
        var ids = await store.SetMembersAsync(AlertKeys.EndpointAlerts(endpoint), cancellationToken);

        return await LoadAsync(ids, cancellationToken);
    }

    public async Task<IReadOnlyList<Alert>> ListPendingAsync(CancellationToken cancellationToken)
    {
        var ids = await store.SetMembersAsync(AlertKeys.Pending, cancellationToken);
        var alerts = await LoadAsync(ids, cancellationToken);

        return alerts.Where(alert => alert.IsPending).ToArray();
    }

    public async Task<Alert?> FindPendingMatchAsync(
        string endpoint, string vehicleId, string stopId, int thresholdMinutes,
        CancellationToken cancellationToken)
    {
        var alerts = await ListByEndpointAsync(endpoint, cancellationToken);

        return alerts.FirstOrDefault(alert =>
            alert.IsPending && alert.Matches(vehicleId, stopId, thresholdMinutes));
    }

    public async Task AddAsync(
        Alert alert, PushSubscription subscription, CancellationToken cancellationToken)
    {
        await store.SetAsync(AlertKeys.Alert(alert.Id), alert, null, cancellationToken);
        await store.SetAsync(
            AlertKeys.Subscription(alert.Endpoint), subscription, SubscriptionRetention, cancellationToken);
        await store.SetAddAsync(AlertKeys.EndpointAlerts(alert.Endpoint), alert.Id, cancellationToken);
        await store.SetAddAsync(AlertKeys.Pending, alert.Id, cancellationToken);
    }

    public async Task UpdateAsync(Alert alert, CancellationToken cancellationToken) =>
        await store.SetAsync(AlertKeys.Alert(alert.Id), alert, null, cancellationToken);

    public async Task<Alert> RetireAsync(
        Alert alert, AlertStatus status, CancellationToken cancellationToken)
    {
        var retired = alert with { Status = status };

        await store.SetAsync(AlertKeys.Alert(retired.Id), retired, TerminalRetention, cancellationToken);
        await store.SetRemoveAsync(AlertKeys.EndpointAlerts(retired.Endpoint), retired.Id, cancellationToken);
        await store.SetRemoveAsync(AlertKeys.Pending, retired.Id, cancellationToken);

        return retired;
    }

    public async Task RemoveAsync(Alert alert, CancellationToken cancellationToken)
    {
        await store.DeleteAsync(AlertKeys.Alert(alert.Id), cancellationToken);
        await store.SetRemoveAsync(AlertKeys.EndpointAlerts(alert.Endpoint), alert.Id, cancellationToken);
        await store.SetRemoveAsync(AlertKeys.Pending, alert.Id, cancellationToken);
    }

    public async Task<PushSubscription?> GetSubscriptionAsync(
        string endpoint, CancellationToken cancellationToken) =>
        await store.GetAsync<PushSubscription>(AlertKeys.Subscription(endpoint), cancellationToken);

    public async Task ForgetSubscriptionAsync(string endpoint, CancellationToken cancellationToken) =>
        await store.DeleteAsync(AlertKeys.Subscription(endpoint), cancellationToken);

    public Alert NewAlert(
        string endpoint, string vehicleId, string lineId, string patternId,
        string stopId, string stopName, int thresholdMinutes) =>
        new(
            Guid.NewGuid().ToString(),
            endpoint,
            vehicleId,
            lineId,
            patternId,
            stopId,
            stopName,
            thresholdMinutes,
            time.GetUtcNow().ToUnixTimeMilliseconds(),
            AlertStatus.Pending);

    private async Task<IReadOnlyList<Alert>> LoadAsync(
        IReadOnlyList<string> ids, CancellationToken cancellationToken)
    {
        if (ids.Count == 0)
        {
            return [];
        }

        var alerts = await Task.WhenAll(ids.Select(id => GetAsync(id, cancellationToken)));

        return alerts.OfType<Alert>().ToArray();
    }
}
