using System.Net;
using System.Security.Cryptography;
using BusLisbon.Api.Alerts;
using Lib.Net.Http.WebPush;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using WireMock.RequestBuilders;
using WireMock.ResponseBuilders;
using WireMock.Server;

namespace BusLisbon.Api.Tests;

public class WebPushAlertNotifierTests : IDisposable
{
    private readonly WireMockServer _pushService = WireMockServer.Start();

    private static string Base64Url(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static (string Public, string Private) VapidKeys()
    {
        using var key = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var parameters = key.ExportParameters(true);

        return (
            Base64Url([0x04, .. parameters.Q.X!, .. parameters.Q.Y!]),
            Base64Url(parameters.D!));
    }

    private static string BrowserPublicKey()
    {
        using var key = ECDiffieHellman.Create(ECCurve.NamedCurves.nistP256);
        var parameters = key.ExportParameters(false);

        return Base64Url([0x04, .. parameters.Q.X!, .. parameters.Q.Y!]);
    }

    private WebPushAlertNotifier BuildNotifier()
    {
        var keys = VapidKeys();

        return new WebPushAlertNotifier(
            new PushServiceClient(new HttpClient()),
            Options.Create(new VapidOptions
            {
                PublicKey = keys.Public,
                PrivateKey = keys.Private,
                Subject = "mailto:test@example.com"
            }),
            NullLogger<WebPushAlertNotifier>.Instance);
    }

    private static Alert AlertFor() => new(
        "7b1e", "endpoint-set-below", "41|814", "1235", "1235_0_2", "060003", "Cascais",
        10, 1755374400000, AlertStatus.Pending);

    private BusLisbon.Api.Alerts.PushSubscription Subscription() => new(
        $"{_pushService.Url}/send/abc",
        new PushSubscriptionKeys(BrowserPublicKey(), Base64Url(RandomNumberGenerator.GetBytes(16))));

    private void PushServiceAnswers(int status) =>
        _pushService.Given(Request.Create().WithPath("/send/abc").UsingPost())
            .RespondWith(Response.Create().WithStatusCode(status));

    [Fact]
    public async Task AnAcceptedNotificationCountsAsSent()
    {
        PushServiceAnswers(201);

        var result = await BuildNotifier().SendAsync(AlertFor(), 7, Subscription(), CancellationToken.None);

        Assert.Equal(PushResult.Sent, result);
    }

    [Fact]
    public async Task TheRequestCarriesTheVapidSignatureAndAnEncryptedBody()
    {
        PushServiceAnswers(201);

        await BuildNotifier().SendAsync(AlertFor(), 7, Subscription(), CancellationToken.None);

        var request = _pushService.LogEntries.Single().RequestMessage!;
        var headers = request.Headers!;

        Assert.Contains("vapid", headers["Authorization"].ToString(), StringComparison.OrdinalIgnoreCase);
        Assert.Equal("aes128gcm", headers["Content-Encoding"].ToString());
        Assert.NotEmpty(request.BodyAsBytes!);
        Assert.DoesNotContain("Cascais", System.Text.Encoding.UTF8.GetString(request.BodyAsBytes!));
    }

    [Theory]
    [InlineData(404)]
    [InlineData(410)]
    public async Task ASubscriptionTheBrowserDroppedIsReportedAsGone(int status)
    {
        PushServiceAnswers(status);

        var result = await BuildNotifier().SendAsync(AlertFor(), 7, Subscription(), CancellationToken.None);

        Assert.Equal(PushResult.SubscriptionGone, result);
    }

    [Theory]
    [InlineData(429)]
    [InlineData(500)]
    public async Task ATransientRefusalIsAFailureWeCanRetry(int status)
    {
        PushServiceAnswers(status);

        var result = await BuildNotifier().SendAsync(AlertFor(), 7, Subscription(), CancellationToken.None);

        Assert.Equal(PushResult.Failed, result);
    }

    [Fact]
    public async Task APushServiceThatCannotBeReachedIsAFailureNotACrash()
    {
        var unreachable = new BusLisbon.Api.Alerts.PushSubscription(
            "http://127.0.0.1:1/send",
            new PushSubscriptionKeys(BrowserPublicKey(), Base64Url(RandomNumberGenerator.GetBytes(16))));

        var result = await BuildNotifier().SendAsync(AlertFor(), 7, unreachable, CancellationToken.None);

        Assert.Equal(PushResult.Failed, result);
    }

    public void Dispose() => _pushService.Dispose();
}
