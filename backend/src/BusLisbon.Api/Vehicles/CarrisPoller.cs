using BusLisbon.Api.Carris;
using Microsoft.Extensions.Options;

namespace BusLisbon.Api.Vehicles;

public sealed class CarrisPoller(
    VehicleGateway gateway,
    VehicleDemand demand,
    TimeProvider time,
    IOptions<CarrisOptions> options,
    ILogger<CarrisPoller> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var ticks = new PeriodicTimer(options.Value.PollInterval, time);

        logger.LogInformation("Polling Carris every {PollInterval} while there is demand",
            options.Value.PollInterval);

        while (await ticks.WaitForNextTickAsync(stoppingToken))
        {
            await PollOnceAsync(stoppingToken);
        }
    }

    public async Task PollOnceAsync(CancellationToken cancellationToken)
    {
        if (!demand.IsActive())
        {
            return;
        }

        await gateway.RefreshAsync(cancellationToken);
    }
}
