using System.Collections.Concurrent;
using System.Text.RegularExpressions;
using BusLisbon.Api.Carris;

namespace BusLisbon.Api.Schedules;

public sealed partial class ShapeCatalogue(IServiceScopeFactory scopes, ILogger<ShapeCatalogue> logger)
{
    private readonly ConcurrentDictionary<string, RouteShape?> shapes = new();

    public async Task<RouteShape?> ForPatternAsync(string patternId, CancellationToken cancellationToken)
    {
        var carrisId = CarrisPatternId(patternId);

        if (shapes.TryGetValue(carrisId, out var known)) return known;

        try
        {
            using var scope = scopes.CreateScope();
            var route = await scope.ServiceProvider.GetRequiredService<ICarrisRoutes>()
                .GetRouteAsync(carrisId, cancellationToken);
            var shape = route is null ? null : new RouteShape(route.Shape, route.Stops);

            shapes[carrisId] = shape;

            return shape;
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            logger.LogWarning(exception, "Loading the shape of pattern {PatternId} failed", carrisId);

            return null;
        }
    }

    public static string CarrisPatternId(string patternId) => AgencyPrefix().Replace(patternId, string.Empty);

    [GeneratedRegex(@"^(\[[^\]]*\])+")]
    private static partial Regex AgencyPrefix();
}
