using BusLisbon.Api.Carris;
using Microsoft.Extensions.Options;

namespace BusLisbon.Api.Vehicles;

public sealed class VehicleDemand(TimeProvider time, IOptions<CarrisOptions> options)
{
    private readonly TimeSpan _window = options.Value.DemandWindow;

    private long _lastRequestedAtTicks;
    private int _subscribers;

    public void Register() => Volatile.Write(ref _lastRequestedAtTicks, time.GetUtcNow().UtcTicks);

    public void AddSubscriber() => Interlocked.Increment(ref _subscribers);

    public void RemoveSubscriber() => Interlocked.Decrement(ref _subscribers);

    public bool IsActive() => Volatile.Read(ref _subscribers) > 0 || WasRequestedRecently();

    private bool WasRequestedRecently()
    {
        var lastRequestedAtTicks = Volatile.Read(ref _lastRequestedAtTicks);

        if (lastRequestedAtTicks == 0)
        {
            return false;
        }

        return time.GetUtcNow() - new DateTimeOffset(lastRequestedAtTicks, TimeSpan.Zero) <= _window;
    }
}
