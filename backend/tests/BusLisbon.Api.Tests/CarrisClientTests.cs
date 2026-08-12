using System.Net;
using BusLisbon.Api.Carris;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Polly.CircuitBreaker;
using WireMock.RequestBuilders;
using WireMock.ResponseBuilders;
using WireMock.Server;

namespace BusLisbon.Api.Tests;

public class CarrisClientTests : IDisposable
{
    private const string TwoVehicles = """
        [{"id":"41|300","lat":38.7856,"lon":-9.3037,"line_id":"1209","pattern_id":"1209_1_1","trip_id":"t1","bearing":302,"speed":8.05,"timestamp":1786009950},
         {"id":"|undefined","agency_id":""}]
        """;

    private readonly WireMockServer _carris = WireMockServer.Start();

    private ICarrisClient BuildClient()
    {
        var services = new ServiceCollection();
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Carris:BaseUrl"] = _carris.Url
            })
            .Build();

        CarrisClient.AddCarrisClient(services, configuration);

        return services.BuildServiceProvider().GetRequiredService<ICarrisClient>();
    }

    [Fact]
    public async Task GetVehiclesAsync_ReturnsEveryElementIncludingTheJunkRow()
    {
        _carris.Given(Request.Create().WithPath("/v2/vehicles").UsingGet())
            .RespondWith(Response.Create().WithStatusCode(200)
                .WithHeader("Content-Type", "application/json").WithBody(TwoVehicles));

        var vehicles = await BuildClient().GetVehiclesAsync(CancellationToken.None);

        Assert.Equal(2, vehicles.Count);
        Assert.Equal("41|300", vehicles[0].Id);
        Assert.Equal("|undefined", vehicles[1].Id);
        Assert.Null(vehicles[1].Lat);
    }

    [Fact]
    public async Task GetVehiclesAsync_RetriesAfterATransientFailure()
    {
        _carris.Given(Request.Create().WithPath("/v2/vehicles").UsingGet())
            .InScenario("flaky").WillSetStateTo("recovered")
            .RespondWith(Response.Create().WithStatusCode(500));

        _carris.Given(Request.Create().WithPath("/v2/vehicles").UsingGet())
            .InScenario("flaky").WhenStateIs("recovered")
            .RespondWith(Response.Create().WithStatusCode(200)
                .WithHeader("Content-Type", "application/json").WithBody(TwoVehicles));

        var vehicles = await BuildClient().GetVehiclesAsync(CancellationToken.None);

        Assert.Equal(2, vehicles.Count);
    }

    [Fact]
    public async Task GetVehiclesAsync_ThrowsWhenTheFeedKeepsFailing()
    {
        _carris.Given(Request.Create().WithPath("/v2/vehicles").UsingGet())
            .RespondWith(Response.Create().WithStatusCode(503));

        var client = BuildClient();

        await Assert.ThrowsAnyAsync<Exception>(() => client.GetVehiclesAsync(CancellationToken.None));
    }

    [Fact]
    public async Task GetVehiclesAsync_StopsCallingTheFeedOnceTheCircuitOpens()
    {
        _carris.Given(Request.Create().WithPath("/v2/vehicles").UsingGet())
            .RespondWith(Response.Create().WithStatusCode(503));

        var client = BuildClient();

        await Assert.ThrowsAnyAsync<Exception>(() => client.GetVehiclesAsync(CancellationToken.None));

        var attemptsBeforeTheBreak = _carris.LogEntries.Count();

        await Assert.ThrowsAnyAsync<BrokenCircuitException>(
            () => client.GetVehiclesAsync(CancellationToken.None));

        Assert.Equal(attemptsBeforeTheBreak, _carris.LogEntries.Count());
    }

    [Fact]
    public async Task GetVehiclesAsync_ThrowsOnMalformedJson()
    {
        _carris.Given(Request.Create().WithPath("/v2/vehicles").UsingGet())
            .RespondWith(Response.Create().WithStatusCode(200)
                .WithHeader("Content-Type", "application/json").WithBody("{\"not\":\"an array\"}"));

        var client = BuildClient();

        await Assert.ThrowsAnyAsync<Exception>(() => client.GetVehiclesAsync(CancellationToken.None));
    }

    [Fact]
    public async Task GetVehiclesAsync_AsksForACompressedResponse()
    {
        _carris.Given(Request.Create().WithPath("/v2/vehicles").UsingGet())
            .RespondWith(Response.Create().WithStatusCode(200)
                .WithHeader("Content-Type", "application/json").WithBody(TwoVehicles));

        await BuildClient().GetVehiclesAsync(CancellationToken.None);

        var request = Assert.Single(_carris.LogEntries);
        var header = Assert.Single(request.RequestMessage!.Headers!,
            h => string.Equals(h.Key, "accept-encoding", StringComparison.OrdinalIgnoreCase));
        Assert.Contains("gzip", string.Join(',', header.Value), StringComparison.OrdinalIgnoreCase);
    }

    public void Dispose() => _carris.Dispose();
}
