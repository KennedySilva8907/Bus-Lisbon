using BusLisbon.Api.Carris;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace BusLisbon.Api.Tests;

public class VehicleHubTests : IClassFixture<HubApiFactory>
{
    private readonly HubApiFactory _factory;

    public VehicleHubTests(HubApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Client_CanConnectAndSubscribeToAVehicle()
    {
        await using var connection = _factory.CreateHubConnection();

        await connection.StartAsync();
        await connection.InvokeAsync("SubscribeToVehicle", "41|300");

        Assert.Equal(HubConnectionState.Connected, connection.State);
    }

    [Fact]
    public async Task Client_CanSubscribeToALine()
    {
        await using var connection = _factory.CreateHubConnection();

        await connection.StartAsync();
        await connection.InvokeAsync("SubscribeToLine", "1209", "1209_1_1");

        Assert.Equal(HubConnectionState.Connected, connection.State);
    }
}

public sealed class HubApiFactory : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.ConfigureServices(services =>
        {
            services.RemoveAll<ICarrisClient>();
            services.AddSingleton<ICarrisClient, FrozenCarrisClient>();
        });
    }

    public HubConnection CreateHubConnection() =>
        new HubConnectionBuilder()
            .WithUrl(new Uri(Server.BaseAddress, "hubs/vehicles"),
                options => options.HttpMessageHandlerFactory = _ => Server.CreateHandler())
            .Build();

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
