using BusLisbon.Api.Carris;
using Microsoft.Extensions.Options;

namespace BusLisbon.Api.Alerts;

public sealed record AlertCheckReport(int Checked, int Fired, int Expired, int StopsFailed);

public sealed class AlertChecker(
    AlertStore store,
    ICarrisArrivals arrivals,
    IAlertNotifier notifier,
    IOptions<AlertOptions> options,
    TimeProvider time,
    ILogger<AlertChecker> logger)
{
    public async Task<AlertCheckReport> CheckOnceAsync(CancellationToken cancellationToken)
    {
        var pending = await store.ListPendingAsync(cancellationToken);

        if (pending.Count == 0)
        {
            return new AlertCheckReport(0, 0, 0, 0);
        }

        var fired = 0;
        var expired = 0;
        var stopsFailed = 0;

        foreach (var group in pending.GroupBy(alert => alert.StopId))
        {
            IReadOnlyList<CarrisArrival> stopArrivals;

            try
            {
                stopArrivals = await arrivals.GetArrivalsAsync(group.Key, cancellationToken);
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                stopsFailed++;
                logger.LogWarning(exception,
                    "Reading arrivals for stop {StopId} failed, leaving its {Count} alerts for the next pass",
                    group.Key, group.Count());

                continue;
            }

            foreach (var alert in group)
            {
                var outcome = await ApplyAsync(alert, stopArrivals, cancellationToken);

                if (outcome == AlertOutcome.Fire)
                {
                    fired++;
                }
                else if (outcome == AlertOutcome.Expire)
                {
                    expired++;
                }
            }
        }

        return new AlertCheckReport(pending.Count, fired, expired, stopsFailed);
    }

    private async Task<AlertOutcome> ApplyAsync(
        Alert alert, IReadOnlyList<CarrisArrival> stopArrivals, CancellationToken cancellationToken)
    {
        var decision = AlertDecider.Decide(alert, stopArrivals, time.GetUtcNow(), options.Value);

        switch (decision.Outcome)
        {
            case AlertOutcome.Fire:
                return await FireAsync(alert, decision.MinutesToShow, cancellationToken);

            case AlertOutcome.Expire:
                await store.RetireAsync(alert, AlertStatus.Expired, cancellationToken);

                return AlertOutcome.Expire;

            case AlertOutcome.Missed:
                await store.UpdateAsync(alert with { MissCount = decision.MissCount }, cancellationToken);

                return AlertOutcome.Missed;

            default:
                return AlertOutcome.Wait;
        }
    }

    private async Task<AlertOutcome> FireAsync(
        Alert alert, int minutesToShow, CancellationToken cancellationToken)
    {
        var subscription = await store.GetSubscriptionAsync(alert.Endpoint, cancellationToken);

        if (subscription is null)
        {
            logger.LogWarning(
                "Alert {AlertId} is due but its device has no subscription stored", alert.Id);

            await store.RetireAsync(alert, AlertStatus.Expired, cancellationToken);

            return AlertOutcome.Expire;
        }

        var result = await notifier.SendAsync(alert, minutesToShow, subscription, cancellationToken);

        if (result == PushResult.Failed)
        {
            return AlertOutcome.Wait;
        }

        if (result == PushResult.SubscriptionGone)
        {
            await store.ForgetSubscriptionAsync(alert.Endpoint, cancellationToken);
            await store.RetireAsync(alert, AlertStatus.Expired, cancellationToken);

            return AlertOutcome.Expire;
        }

        await store.RetireAsync(alert, AlertStatus.Fired, cancellationToken);

        return AlertOutcome.Fire;
    }
}
