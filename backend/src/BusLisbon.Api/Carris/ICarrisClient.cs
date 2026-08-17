namespace BusLisbon.Api.Carris;

public interface ICarrisClient
{
    Task<IReadOnlyList<CarrisVehicle>> GetVehiclesAsync(CancellationToken cancellationToken);
}

public interface ICarrisArrivals
{
    Task<IReadOnlyList<CarrisArrival>> GetArrivalsAsync(string stopId, CancellationToken cancellationToken);
}
