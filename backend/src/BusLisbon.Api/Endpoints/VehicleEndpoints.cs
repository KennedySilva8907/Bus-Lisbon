using BusLisbon.Api.Vehicles;

namespace BusLisbon.Api.Endpoints;

public sealed record VehicleResponse(Vehicle Vehicle, double AgeSeconds, bool Stale);

public static class VehicleEndpoints
{
    public static IEndpointRouteBuilder MapVehicleEndpoints(this IEndpointRouteBuilder app)
    {
        var vehicles = app.MapGroup("/api/vehicles");

        vehicles.MapGet("/status", async (
            VehicleGateway gateway,
            CancellationToken cancellationToken) =>
            Results.Ok(await gateway.GetStatusAsync(cancellationToken)));

        vehicles.MapGet("/{id}", async (
            string id,
            VehicleGateway gateway,
            VehicleDemand demand,
            CancellationToken cancellationToken) =>
        {
            demand.Register();

            var status = await gateway.GetStatusAsync(cancellationToken);

            if (status.AgeSeconds is not { } age)
            {
                return Results.Problem(
                    "The vehicle feed has not been read successfully yet",
                    statusCode: StatusCodes.Status503ServiceUnavailable);
            }

            var vehicle = await gateway.GetVehicleAsync(id, cancellationToken);

            return vehicle is null
                ? Results.NotFound()
                : Results.Ok(new VehicleResponse(vehicle, age, status.Stale));
        });

        return app;
    }
}
