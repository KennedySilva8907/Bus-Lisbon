using System.Text.Json;
using BusLisbon.Api.Alerts;

namespace BusLisbon.Api.Tests;

public class AlertPushTests
{
    private static readonly Alert Alert = new(
        "7b1e", "https://push.example/abc", "41|814", "1235", "1235_0_2", "060003",
        "Cascais (Terminal)", 10, 1755374400000, AlertStatus.Pending);

    [Fact]
    public void TheTitleIsTheLineAndTheBodySaysWhereAndWhen()
    {
        var payload = AlertPush.PayloadFor(Alert, 7);

        Assert.Equal("🚌 1235", payload.Title);
        Assert.Equal("Chega à Cascais (Terminal) em ~7 min", payload.Body);
    }

    [Fact]
    public void TheTagKeepsTwoNotificationsForTheSameBusFromStacking()
    {
        Assert.Equal("bus-41|814-060003", AlertPush.PayloadFor(Alert, 7).Tag);
    }

    [Fact]
    public void TheUrlCarriesEverythingTheAppNeedsToReopenTheBus()
    {
        var url = AlertPush.PayloadFor(Alert, 7).Url;

        Assert.Equal("/?stop=060003&vehicle=41|814&pattern=1235_0_2&line=1235", url);
    }

    [Fact]
    public void TheServiceWorkerFindsEveryFieldItReads()
    {
        var json = AlertPush.Serialize(AlertPush.PayloadFor(Alert, 7));

        using var parsed = JsonDocument.Parse(json);
        var root = parsed.RootElement;

        foreach (var field in new[] { "title", "body", "tag", "stopId", "vehicleId", "lineId", "patternId", "url" })
        {
            Assert.True(root.TryGetProperty(field, out _), $"the payload is missing {field}");
        }
    }

    [Theory]
    [InlineData(404)]
    [InlineData(410)]
    public void ASubscriptionTheBrowserRejectsIsGone(int status)
    {
        Assert.True(WebPushAlertNotifier.IsGone((System.Net.HttpStatusCode)status));
    }

    [Theory]
    [InlineData(429)]
    [InlineData(500)]
    [InlineData(503)]
    public void ATransientFailureIsNotGone(int status)
    {
        Assert.False(WebPushAlertNotifier.IsGone((System.Net.HttpStatusCode)status));
    }
}
