using BusLisbon.Api.Carris;
using Microsoft.Extensions.Options;

namespace BusLisbon.Api.Vehicles;

public sealed record VehicleGatewayStatus(int LiveVehicles, double? AgeSeconds, bool Stale);

public sealed class VehicleGateway(
    ICarrisClient client,
    TimeProvider time,
    IOptions<CarrisOptions> options,
    ILogger<VehicleGateway> logger)
{
    private readonly SemaphoreSlim _refreshLock = new(1, 1);
    private readonly TimeSpan _pollInterval = options.Value.PollInterval;

    private VehicleSnapshot? _snapshot;

    public async Task<Vehicle?> GetVehicleAsync(string id, CancellationToken cancellationToken)
    {
        var snapshot = await EnsureFreshAsync(cancellationToken);

        return snapshot is not null && snapshot.ById.TryGetValue(id, out var vehicle) ? vehicle : null;
    }

    public async Task<Vehicle?> GetVehicleByLineAsync(
        string lineId, string? patternId, CancellationToken cancellationToken)
    {
        var snapshot = await EnsureFreshAsync(cancellationToken);

        return snapshot?.All.FirstOrDefault(vehicle =>
            vehicle.LineId == lineId
            && (string.IsNullOrEmpty(patternId) || vehicle.PatternId == patternId));
    }

    public async Task<Vehicle?> GetVehicleByTripAsync(
        string tripId, string? number, string? lineId, CancellationToken cancellationToken)
    {
        var snapshot = await EnsureFreshAsync(cancellationToken);

        return snapshot is null ? null : VehicleMatcher.Find(snapshot.All, tripId, number, lineId);
    }

    public async Task<IReadOnlyDictionary<string, string>> GetVehiclesByTripAsync(
        CancellationToken cancellationToken)
    {
        var snapshot = await EnsureFreshAsync(cancellationToken);
        var byTrip = new Dictionary<string, string>();

        foreach (var vehicle in snapshot?.All ?? [])
        {
            var trip = VehicleMatcher.BareTripId(vehicle.TripId);

            if (trip.Length > 0) byTrip[trip] = vehicle.Id;
        }

        return byTrip;
    }

    public async Task<VehicleGatewayStatus> GetStatusAsync(CancellationToken cancellationToken)
    {
        var snapshot = await EnsureFreshAsync(cancellationToken);

        if (snapshot is null)
        {
            return new VehicleGatewayStatus(0, null, true);
        }

        var age = (time.GetUtcNow() - snapshot.FetchedAt).TotalSeconds;

        return new VehicleGatewayStatus(snapshot.All.Count, age, age > VehicleFilter.FreshWindowSeconds);
    }

    public async Task RefreshAsync(CancellationToken cancellationToken)
    {
        await _refreshLock.WaitAsync(cancellationToken);

        try
        {
            await FetchAndReplaceAsync(cancellationToken);
        }
        finally
        {
            _refreshLock.Release();
        }
    }

    private async Task<VehicleSnapshot?> EnsureFreshAsync(CancellationToken cancellationToken)
    {
        if (IsFreshEnough(Volatile.Read(ref _snapshot)))
        {
            return _snapshot;
        }

        await _refreshLock.WaitAsync(cancellationToken);

        try
        {
            var current = Volatile.Read(ref _snapshot);

            if (IsFreshEnough(current))
            {
                return current;
            }

            await FetchAndReplaceAsync(cancellationToken);

            return Volatile.Read(ref _snapshot);
        }
        finally
        {
            _refreshLock.Release();
        }
    }

    private bool IsFreshEnough(VehicleSnapshot? snapshot) =>
        snapshot is not null && time.GetUtcNow() - snapshot.FetchedAt < _pollInterval;

    private async Task FetchAndReplaceAsync(CancellationToken cancellationToken)
    {
        try
        {
            var now = time.GetUtcNow();

            var live = (await client.GetVehiclesAsync(cancellationToken))
                .Where(vehicle => VehicleFilter.IsLive(vehicle, now))
                .Select(Vehicle.From);

            Volatile.Write(ref _snapshot, VehicleSnapshot.From(live, now));
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            logger.LogWarning(exception,
                "Refreshing the vehicle snapshot failed, serving the snapshot from {FetchedAt}",
                Volatile.Read(ref _snapshot)?.FetchedAt);
        }
    }
}
