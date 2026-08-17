using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using BusLisbon.Api.Alerts;
using BusLisbon.Api.Carris;
using BusLisbon.Api.Endpoints;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;

namespace BusLisbon.Api.Tests;

public class AlertDiagnosticsTests : IClassFixture<DiagnosticsApiFactory>
{
    private const string Secret = "let-me-look";
    private const string Endpoint = "https://push.example/abcdefghijklmnopqrstuvwxyz";

    private readonly DiagnosticsApiFactory _factory;

    public AlertDiagnosticsTests(DiagnosticsApiFactory factory) => _factory = factory;

    private HttpClient Authorised()
    {
        var client = _factory.CreateClient();

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", Secret);

        return client;
    }

    private async Task CreateAlertAsync(HttpClient client, int thresholdMinutes = 10) =>
        await client.PostAsJsonAsync("/api/alerts", new
        {
            subscription = new { endpoint = Endpoint, keys = new { p256dh = "BNc", auth = "tok" } },
            vehicleId = "41|300",
            lineId = "1209",
            patternId = "1209_1_1",
            stopId = "060003",
            stopName = "Cascais",
            thresholdMinutes
        });

    [Fact]
    public async Task WithoutTheSecretItSaysNothing()
    {
        _factory.WithFreshStore();

        var response = await _factory.CreateClient().GetAsync("/api/alerts/pending");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task WithTheWrongSecretItSaysNothing()
    {
        _factory.WithFreshStore();
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", "guess");

        var response = await client.GetAsync("/api/alerts/pending");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task ItListsWhatIsPending()
    {
        _factory.WithFreshStore();
        var client = Authorised();

        await CreateAlertAsync(client);

        var body = await client.GetFromJsonAsync<AlertDiagnostics>("/api/alerts/pending");

        Assert.Equal(1, body!.Pending);
        Assert.Equal("1209", body.Alerts[0].LineId);
        Assert.Equal("Cascais", body.Alerts[0].StopName);
        Assert.Equal(10, body.Alerts[0].ThresholdMinutes);
    }

    [Fact]
    public async Task ItShowsOnlyTheTailOfTheDeviceEndpoint()
    {
        _factory.WithFreshStore();
        var client = Authorised();

        await CreateAlertAsync(client);

        var body = await client.GetFromJsonAsync<AlertDiagnostics>("/api/alerts/pending");
        var tail = body!.Alerts[0].EndpointTail;

        Assert.Equal(20, tail.Length);
        Assert.EndsWith(tail, Endpoint);
        Assert.DoesNotContain("push.example", tail);
    }

    [Fact]
    public async Task AnAlertThatWasCancelledIsNoLongerPending()
    {
        _factory.WithFreshStore();
        var client = Authorised();

        await CreateAlertAsync(client);
        var listed = await client.GetFromJsonAsync<AlertDiagnostics>("/api/alerts/pending");
        var id = listed!.Alerts[0].Id;

        await client.DeleteAsync($"/api/alerts/{id}?endpoint={Uri.EscapeDataString(Endpoint)}");

        var after = await client.GetFromJsonAsync<AlertDiagnostics>("/api/alerts/pending");

        Assert.Equal(0, after!.Pending);
    }
}

public sealed class DiagnosticsApiFactory : WebApplicationFactory<Program>
{
    private FakeKeyValueStore _store = new();

    public DiagnosticsApiFactory WithFreshStore()
    {
        _store = new FakeKeyValueStore();

        return this;
    }

    protected override IHost CreateHost(IHostBuilder builder)
    {
        builder.ConfigureHostConfiguration(config => config.AddInMemoryCollection(
            new Dictionary<string, string?> { ["Diagnostics:Secret"] = "let-me-look" }));

        return base.CreateHost(builder);
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
