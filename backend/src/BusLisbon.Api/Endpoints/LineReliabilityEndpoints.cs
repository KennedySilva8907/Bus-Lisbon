using BusLisbon.Api.Alerts;
using BusLisbon.Api.Reliability;

namespace BusLisbon.Api.Endpoints;

public static class LineReliabilityEndpoints
{
    public static IEndpointRouteBuilder MapLineReliabilityEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/lines/reliability", async (
            IKeyValueStore store,
            CancellationToken cancellationToken) =>
        {
            var ranking = await store.GetAsync<LineRanking>(ReliabilityKeys.Summary, cancellationToken);

            return Results.Ok(ranking ?? new LineRanking(0, 0, []));
        });

        return app;
    }
}
