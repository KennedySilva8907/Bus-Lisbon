using BusLisbon.Api.Vehicles;
using Microsoft.AspNetCore.SignalR;

namespace BusLisbon.Api.Realtime;

public sealed class VehicleHub(VehicleSubscriptions subscriptions, VehicleDemand demand) : Hub
{
    public async Task SubscribeToVehicle(string vehicleId)
    {
        var target = new VehicleTarget(vehicleId, null, null);

        subscriptions.Add(Context.ConnectionId, target);

        await Groups.AddToGroupAsync(Context.ConnectionId, target.Group);
    }

    public async Task SubscribeToLine(string lineId, string? patternId)
    {
        var target = new VehicleTarget(null, lineId, patternId);

        subscriptions.Add(Context.ConnectionId, target);

        await Groups.AddToGroupAsync(Context.ConnectionId, target.Group);
    }

    public override Task OnConnectedAsync()
    {
        demand.AddSubscriber();

        return base.OnConnectedAsync();
    }

    public override Task OnDisconnectedAsync(Exception? exception)
    {
        subscriptions.RemoveConnection(Context.ConnectionId);
        demand.RemoveSubscriber();

        return base.OnDisconnectedAsync(exception);
    }
}
