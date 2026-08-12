using BusLisbon.Api.Endpoints;
using BusLisbon.Api.Vehicles;
using Microsoft.AspNetCore.SignalR;

namespace BusLisbon.Api.Realtime;

public interface IVehicleSender
{
    Task SendAsync(string group, VehicleResponse payload, CancellationToken cancellationToken);
}

public sealed class SignalRVehicleSender(IHubContext<VehicleHub> hub) : IVehicleSender
{
    public Task SendAsync(string group, VehicleResponse payload, CancellationToken cancellationToken) =>
        hub.Clients.Group(group).SendAsync("vehicleUpdated", payload, cancellationToken);
}

public interface IVehicleBroadcaster
{
    Task PublishChangesAsync(CancellationToken cancellationToken);
}

public sealed class VehicleBroadcaster(
    VehicleGateway gateway,
    VehicleSubscriptions subscriptions,
    IVehicleSender sender,
    TimeProvider time,
    ILogger<VehicleBroadcaster> logger) : IVehicleBroadcaster
{
    public async Task PublishChangesAsync(CancellationToken cancellationToken)
    {
        var targets = subscriptions.ActiveTargets();

        if (targets.Count == 0)
        {
            return;
        }

        var status = await gateway.GetStatusAsync(cancellationToken);

        if (status.AgeSeconds is not { } age)
        {
            return;
        }

        foreach (var target in targets)
        {
            try
            {
                var vehicle = target.VehicleId is { Length: > 0 }
                    ? await gateway.GetVehicleAsync(target.VehicleId, cancellationToken)
                    : await gateway.GetVehicleByLineAsync(target.LineId!, target.PatternId, cancellationToken);

                if (vehicle is null || !subscriptions.HasChanged(target.Group, vehicle))
                {
                    continue;
                }

                await sender.SendAsync(target.Group, new VehicleResponse(vehicle, age, status.Stale),
                    cancellationToken);
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                logger.LogWarning(exception, "Publishing {Group} failed", target.Group);
            }
        }
    }
}
