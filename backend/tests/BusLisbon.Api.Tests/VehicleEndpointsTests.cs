using System.Net;
using System.Net.Http.Json;
using BusLisbon.Api.Carris;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace BusLisbon.Api.Tests;

public class VehicleEndpointsTests : IClassFixture<VehicleApiFactory>
{
    private readonly VehicleApiFactory _factory;

    public VehicleEndpointsTests(VehicleApiFactory factory) => _factory = factory;

    [Fact]
    public async Task GetVehicle_ReturnsTheVehicleWithTheAgeOfTheData()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/api/vehicles/41%7C300");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<VehicleResponseBody>();

        Assert.NotNull(body);
        Assert.Equal("41|300", body!.Vehicle.Id);
        Assert.Equal(38.7856, body.Vehicle.Lat);
        Assert.Equal(-9.3037, body.Vehicle.Lon);
        Assert.Equal("1209", body.Vehicle.LineId);
        Assert.False(body.Stale);
    }

    [Fact]
    public async Task GetVehicle_ReturnsNotFoundForAnUnknownId()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/api/vehicles/nobody");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task GetStatus_ReportsTheLiveVehicleCount()
    {
        var client = _factory.CreateClient();

        var body = await client.GetFromJsonAsync<StatusBody>("/api/vehicles/status");

        Assert.NotNull(body);
        Assert.Equal(1, body!.LiveVehicles);
    }

    private sealed record VehicleResponseBody(VehicleBody Vehicle, double AgeSeconds, bool Stale);

    private sealed record VehicleBody(string Id, double Lat, double Lon, string? LineId);

    private sealed record StatusBody(int LiveVehicles, double? AgeSeconds, bool Stale);
}

public sealed class VehicleApiFactory : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.ConfigureServices(services =>
        {
            services.RemoveAll<ICarrisClient>();
            services.AddSingleton<ICarrisClient, FrozenCarrisClient>();
        });
    }

    private sealed class FrozenCarrisClient : ICarrisClient
    {
        public Task<IReadOnlyList<CarrisVehicle>> GetVehiclesAsync(CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<CarrisVehicle>>(
            [
                new CarrisVehicle
                {
                    Id = "41|300",
                    Lat = 38.7856,
                    Lon = -9.3037,
                    LineId = "1209",
                    PatternId = "1209_1_1",
                    TripId = "t1",
                    Bearing = 302,
                    Speed = 8.05,
                    Timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds()
                }
            ]);
    }
}
