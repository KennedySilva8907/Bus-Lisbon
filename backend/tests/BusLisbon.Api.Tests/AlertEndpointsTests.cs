using System.Net;
using System.Net.Http.Json;
using BusLisbon.Api.Alerts;
using BusLisbon.Api.Endpoints;
using BusLisbon.Api.Carris;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace BusLisbon.Api.Tests;

public class AlertEndpointsTests : IClassFixture<AlertApiFactory>
{
    private const string Endpoint = "https://push.example/abc";
    private const string OtherEndpoint = "https://push.example/someone-else";

    private readonly AlertApiFactory _factory;

    public AlertEndpointsTests(AlertApiFactory factory) => _factory = factory;

    private static object Body(
        string endpoint = Endpoint,
        string vehicleId = "41|300",
        string stopId = "060003",
        int thresholdMinutes = 10) => new
        {
            subscription = new { endpoint, keys = new { p256dh = "BNc", auth = "tok" } },
            vehicleId,
            lineId = "1209",
            patternId = "1209_1_1",
            stopId,
            stopName = "Cascais",
            thresholdMinutes
        };

    private static int _caller;

    private static HttpClient FromItsOwnAddress(HttpClient client)
    {
        client.DefaultRequestHeaders.Remove("X-Forwarded-For");
        client.DefaultRequestHeaders.Add("X-Forwarded-For", $"203.0.113.{Interlocked.Increment(ref _caller) % 250}");

        return client;
    }

    private async Task<Alert> CreateAsync(HttpClient client, object body)
    {
        var response = await FromItsOwnAddress(client).PostAsJsonAsync("/api/alerts", body);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        return (await response.Content.ReadFromJsonAsync<Alert>())!;
    }

    [Fact]
    public async Task Creating_StopsAfterEnoughTriesFromOneAddress()
    {
        var client = _factory.WithFreshStore().CreateClient();
        client.DefaultRequestHeaders.Add("X-Forwarded-For", "198.51.100.99");

        var codes = new List<HttpStatusCode>();

        for (var i = 0; i < AlertEndpoints.WritesPerWindow + 3; i++)
        {
            var response = await client.PostAsJsonAsync(
                "/api/alerts", Body(endpoint: $"https://push.example/flood-{i}"));

            codes.Add(response.StatusCode);
        }

        Assert.Equal(AlertEndpoints.WritesPerWindow, codes.Count(code => code == HttpStatusCode.Created));
        Assert.Equal(3, codes.Count(code => code == HttpStatusCode.TooManyRequests));
    }

    [Fact]
    public async Task Creating_CountsEachAddressOnItsOwn()
    {
        var factory = _factory.WithFreshStore();

        for (var i = 0; i < AlertEndpoints.WritesPerWindow + 2; i++)
        {
            var client = factory.CreateClient();
            client.DefaultRequestHeaders.Add("X-Forwarded-For", $"192.0.2.{i}");

            var response = await client.PostAsJsonAsync(
                "/api/alerts", Body(endpoint: $"https://push.example/spread-{i}"));

            Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        }
    }

    [Fact]
    public async Task Creating_AnswersWithTheStoredAlert()
    {
        var client = _factory.WithFreshStore().CreateClient();

        var alert = await CreateAsync(client, Body());

        Assert.NotEqual(string.Empty, alert.Id);
        Assert.Equal("41|300", alert.VehicleId);
        Assert.Equal("Cascais", alert.StopName);
        Assert.Equal(10, alert.ThresholdMinutes);
        Assert.Equal(AlertStatus.Pending, alert.Status);
    }

    [Fact]
    public async Task AskingForTheSameAlertTwice_AnswersOkWithTheOneThatExists()
    {
        var client = _factory.WithFreshStore().CreateClient();

        var first = await CreateAsync(client, Body());
        var second = await client.PostAsJsonAsync("/api/alerts", Body());

        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        Assert.Equal(first.Id, (await second.Content.ReadFromJsonAsync<Alert>())!.Id);
    }

    [Fact]
    public async Task ADifferentThreshold_IsANewAlert()
    {
        var client = _factory.WithFreshStore().CreateClient();

        var first = await CreateAsync(client, Body(thresholdMinutes: 10));
        var second = await CreateAsync(client, Body(thresholdMinutes: 5));

        Assert.NotEqual(first.Id, second.Id);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(61)]
    public async Task AThresholdOutsideTheAllowedRange_IsRejected(int thresholdMinutes)
    {
        var client = _factory.WithFreshStore().CreateClient();

        var response = await client.PostAsJsonAsync("/api/alerts", Body(thresholdMinutes: thresholdMinutes));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task AnAlertWithoutAVehicle_IsRejected()
    {
        var client = _factory.WithFreshStore().CreateClient();

        var response = await client.PostAsJsonAsync("/api/alerts", Body(vehicleId: ""));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task AnAlertWithoutASubscriptionEndpoint_IsRejected()
    {
        var client = _factory.WithFreshStore().CreateClient();

        var response = await client.PostAsJsonAsync("/api/alerts", Body(endpoint: ""));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Listing_ReturnsOnlyThisDevicesAlerts()
    {
        var client = _factory.WithFreshStore().CreateClient();

        var mine = await CreateAsync(client, Body());
        await CreateAsync(client, Body(endpoint: OtherEndpoint));

        var listed = await client.GetFromJsonAsync<List<Alert>>(
            $"/api/alerts?endpoint={Uri.EscapeDataString(Endpoint)}");

        Assert.Equal([mine.Id], listed!.Select(alert => alert.Id));
    }

    [Fact]
    public async Task ListingWithoutAnEndpoint_IsRejected()
    {
        var client = _factory.WithFreshStore().CreateClient();

        var response = await client.GetAsync("/api/alerts");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Cancelling_RemovesItFromTheList()
    {
        var client = _factory.WithFreshStore().CreateClient();

        var alert = await CreateAsync(client, Body());

        var response = await client.DeleteAsync(
            $"/api/alerts/{alert.Id}?endpoint={Uri.EscapeDataString(Endpoint)}");

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);

        var listed = await client.GetFromJsonAsync<List<Alert>>(
            $"/api/alerts?endpoint={Uri.EscapeDataString(Endpoint)}");

        Assert.Empty(listed!);
    }

    [Fact]
    public async Task CancellingAnAlertNobodyHas_IsNotFound()
    {
        var client = _factory.WithFreshStore().CreateClient();

        var response = await client.DeleteAsync(
            $"/api/alerts/nobody?endpoint={Uri.EscapeDataString(Endpoint)}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task CancellingSomeoneElsesAlert_IsForbidden()
    {
        var client = _factory.WithFreshStore().CreateClient();

        var alert = await CreateAsync(client, Body());

        var response = await client.DeleteAsync(
            $"/api/alerts/{alert.Id}?endpoint={Uri.EscapeDataString(OtherEndpoint)}");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task AnAlertSomeoneElseFailedToCancel_IsStillThere()
    {
        var client = _factory.WithFreshStore().CreateClient();

        var alert = await CreateAsync(client, Body());

        await client.DeleteAsync($"/api/alerts/{alert.Id}?endpoint={Uri.EscapeDataString(OtherEndpoint)}");

        var listed = await client.GetFromJsonAsync<List<Alert>>(
            $"/api/alerts?endpoint={Uri.EscapeDataString(Endpoint)}");

        Assert.Equal([alert.Id], listed!.Select(a => a.Id));
    }
}

public sealed class AlertApiFactory : WebApplicationFactory<Program>
{
    private FakeKeyValueStore _store = new();

    public AlertApiFactory WithFreshStore()
    {
        _store = new FakeKeyValueStore();

        return this;
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.ConfigureServices(services =>
        {
            services.RemoveAll<ICarrisClient>();
            services.AddSingleton<ICarrisClient, EmptyCarrisClient>();
            services.RemoveAll<IKeyValueStore>();
            services.AddScoped<IKeyValueStore>(_ => _store);
        });
    }

    private sealed class EmptyCarrisClient : ICarrisClient
    {
        public Task<IReadOnlyList<CarrisVehicle>> GetVehiclesAsync(CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<CarrisVehicle>>([]);
    }
}
