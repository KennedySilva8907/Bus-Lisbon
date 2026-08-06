namespace BusLisbon.Api.Carris;

public interface ICarrisClient
{
    Task<IReadOnlyList<CarrisVehicle>> GetVehiclesAsync(CancellationToken cancellationToken);
}
