using System.Text.Json;
using BusLisbon.Api.Alerts;

namespace BusLisbon.Api.Tests;

public class AlertSerializationTests
{
    private static readonly JsonSerializerOptions Payload = new(JsonSerializerDefaults.Web);

    private const string WrittenByTheOldFunctions = """
        {"id":"7b1e","endpoint":"https://push.example/abc","vehicleId":"41|814",
         "lineId":"1235","patternId":"1235_0_2","stopId":"060003","stopName":"Cascais",
         "thresholdMinutes":10,"createdAt":1755374400000,"status":"pending","missCount":2}
        """;

    [Fact]
    public void AnAlertWrittenByTheOldFunctionsStillReads()
    {
        var alert = JsonSerializer.Deserialize<Alert>(WrittenByTheOldFunctions, Payload);

        Assert.NotNull(alert);
        Assert.Equal("41|814", alert.VehicleId);
        Assert.Equal("Cascais", alert.StopName);
        Assert.Equal(10, alert.ThresholdMinutes);
        Assert.Equal(1755374400000, alert.CreatedAt);
        Assert.Equal(AlertStatus.Pending, alert.Status);
        Assert.Equal(2, alert.MissCount);
    }

    [Fact]
    public void AnAlertWeWriteKeepsTheShapeTheOldFunctionsUsed()
    {
        var alert = JsonSerializer.Deserialize<Alert>(WrittenByTheOldFunctions, Payload)!;

        var json = JsonSerializer.Serialize(alert with { Status = AlertStatus.Fired }, Payload);

        Assert.Contains("\"vehicleId\":\"41|814\"", json);
        Assert.Contains("\"thresholdMinutes\":10", json);
        Assert.Contains("\"status\":\"fired\"", json);
        Assert.DoesNotContain("\"Status\"", json);
    }

    [Fact]
    public void ASubscriptionWrittenByTheOldFunctionsStillReads()
    {
        const string stored = """
            {"endpoint":"https://push.example/abc","keys":{"p256dh":"BNc","auth":"tok"}}
            """;

        var subscription = JsonSerializer.Deserialize<PushSubscription>(stored, Payload);

        Assert.Equal("https://push.example/abc", subscription!.Endpoint);
        Assert.Equal("BNc", subscription.Keys.P256dh);
        Assert.Equal("tok", subscription.Keys.Auth);
    }
}
