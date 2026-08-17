using System.Net;
using Lib.Net.Http.WebPush;
using Lib.Net.Http.WebPush.Authentication;
using Microsoft.Extensions.Options;

namespace BusLisbon.Api.Alerts;

public interface IAlertNotifier
{
    Task<PushResult> SendAsync(
        Alert alert, int minutesToShow, PushSubscription subscription, CancellationToken cancellationToken);
}

public sealed class WebPushAlertNotifier(
    PushServiceClient client,
    IOptions<VapidOptions> options,
    ILogger<WebPushAlertNotifier> logger) : IAlertNotifier
{
    public async Task<PushResult> SendAsync(
        Alert alert, int minutesToShow, PushSubscription subscription, CancellationToken cancellationToken)
    {
        var vapid = options.Value;
        var target = new Lib.Net.Http.WebPush.PushSubscription { Endpoint = subscription.Endpoint };

        target.SetKey(PushEncryptionKeyName.P256DH, subscription.Keys.P256dh);
        target.SetKey(PushEncryptionKeyName.Auth, subscription.Keys.Auth);

        var message = new PushMessage(AlertPush.Serialize(AlertPush.PayloadFor(alert, minutesToShow)));

        try
        {
            await client.RequestPushMessageDeliveryAsync(
                target,
                message,
                new VapidAuthentication(vapid.PublicKey, vapid.PrivateKey) { Subject = vapid.Subject },
                cancellationToken);

            return PushResult.Sent;
        }
        catch (PushServiceClientException exception)
        {
            return Interpret(exception.StatusCode, alert.Id);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            logger.LogWarning(exception, "Sending alert {AlertId} failed before reaching the push service", alert.Id);

            return PushResult.Failed;
        }
    }

    private PushResult Interpret(HttpStatusCode status, string alertId)
    {
        if (IsGone(status))
        {
            logger.LogInformation("Alert {AlertId} has a subscription the browser no longer accepts", alertId);

            return PushResult.SubscriptionGone;
        }

        logger.LogWarning("The push service answered {Status} for alert {AlertId}", (int)status, alertId);

        return PushResult.Failed;
    }

    public static bool IsGone(HttpStatusCode status) =>
        status is HttpStatusCode.NotFound or HttpStatusCode.Gone;
}
