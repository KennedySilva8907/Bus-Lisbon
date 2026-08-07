using BusLisbon.Api.Carris;
using Microsoft.Extensions.Options;

namespace BusLisbon.Api.Vehicles;

public sealed class VehicleDemand(TimeProvider time, IOptions<CarrisOptions> options)
{
    private readonly TimeSpan _window = options.Value.DemandWindow;

    private long _lastRequestedAtTicks;

    public void Register() => Volatile.Write(ref _lastRequestedAtTicks, time.GetUtcNow().UtcTicks);

    public bool IsActive()
    {
        var lastRequestedAtTicks = Volatile.Read(ref _lastRequestedAtTicks);

        if (lastRequestedAtTicks == 0)
        {
            return false;
        }

        var lastRequestedAt = new DateTimeOffset(lastRequestedAtTicks, TimeSpan.Zero);

        return time.GetUtcNow() - lastRequestedAt <= _window;
    }
}
