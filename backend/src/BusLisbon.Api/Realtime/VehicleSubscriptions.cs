using System.Collections.Concurrent;
using BusLisbon.Api.Vehicles;

namespace BusLisbon.Api.Realtime;

public sealed class VehicleSubscriptions
{
    private readonly ConcurrentDictionary<string, ConcurrentDictionary<string, VehicleTarget>> _byConnection = new();
    private readonly ConcurrentDictionary<string, Vehicle> _lastSent = new();

    public void Add(string connectionId, VehicleTarget target)
    {
        var targets = _byConnection.GetOrAdd(connectionId, _ => new ConcurrentDictionary<string, VehicleTarget>());

        targets[target.Group] = target;
    }

    public void RemoveConnection(string connectionId)
    {
        if (!_byConnection.TryRemove(connectionId, out var targets))
        {
            return;
        }

        foreach (var group in targets.Keys)
        {
            if (!IsWatched(group))
            {
                Forget(group);
            }
        }
    }

    public IReadOnlyList<VehicleTarget> ActiveTargets() =>
        _byConnection.Values
            .SelectMany(targets => targets.Values)
            .DistinctBy(target => target.Group)
            .ToArray();

    public bool HasChanged(string group, Vehicle vehicle)
    {
        var changed = !_lastSent.TryGetValue(group, out var previous) || previous != vehicle;

        _lastSent[group] = vehicle;

        return changed;
    }

    public void Forget(string group) => _lastSent.TryRemove(group, out _);

    private bool IsWatched(string group) =>
        _byConnection.Values.Any(targets => targets.ContainsKey(group));
}
