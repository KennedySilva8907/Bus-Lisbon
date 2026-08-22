using System.Threading.RateLimiting;
using BusLisbon.Api.Alerts;

namespace BusLisbon.Api.Endpoints;

public sealed record CreateAlertRequest(
    PushSubscription? Subscription,
    string? VehicleId,
    string? LineId,
    string? PatternId,
    string? StopId,
    string? StopName,
    int ThresholdMinutes);

public static class AlertEndpoints
{
    private const int MinThresholdMinutes = 1;
    private const int MaxThresholdMinutes = 60;

    public const string WritePolicy = "alert-writes";

    public static readonly TimeSpan Window = TimeSpan.FromMinutes(1);

    public const int WritesPerWindow = 20;

    public static IServiceCollection AddAlertRateLimit(this IServiceCollection services) =>
        services.AddRateLimiter(limiter =>
        {
            limiter.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

            limiter.AddPolicy(WritePolicy, context => RateLimitPartition.GetFixedWindowLimiter(
                CallerOf(context),
                _ => new FixedWindowRateLimiterOptions { PermitLimit = WritesPerWindow, Window = Window }));
        });

    public static string CallerOf(HttpContext context) =>
        context.Request.Headers["X-Forwarded-For"].FirstOrDefault()?.Split(',')[0].Trim()
            ?? context.Connection.RemoteIpAddress?.ToString()
            ?? "unknown";

    public static IEndpointRouteBuilder MapAlertEndpoints(this IEndpointRouteBuilder app)
    {
        var alerts = app.MapGroup("/api/alerts").RequireRateLimiting(WritePolicy);

        alerts.MapPost("/", async (
            CreateAlertRequest request,
            AlertStore store,
            CancellationToken cancellationToken) =>
        {
            if (request.Subscription is not { Endpoint.Length: > 0 } subscription
                || string.IsNullOrEmpty(request.VehicleId)
                || string.IsNullOrEmpty(request.StopId))
            {
                return Results.BadRequest(new { error = "campos em falta" });
            }

            if (request.ThresholdMinutes is < MinThresholdMinutes or > MaxThresholdMinutes)
            {
                return Results.BadRequest(new
                {
                    error = $"thresholdMinutes deve estar entre {MinThresholdMinutes} e {MaxThresholdMinutes}"
                });
            }

            var duplicate = await store.FindPendingMatchAsync(
                subscription.Endpoint, request.VehicleId, request.StopId,
                request.ThresholdMinutes, cancellationToken);

            if (duplicate is not null)
            {
                return Results.Ok(duplicate);
            }

            var alert = store.NewAlert(
                subscription.Endpoint,
                request.VehicleId,
                request.LineId ?? string.Empty,
                request.PatternId ?? string.Empty,
                request.StopId,
                request.StopName ?? string.Empty,
                request.ThresholdMinutes);

            await store.AddAsync(alert, subscription, cancellationToken);

            return Results.Created($"/api/alerts/{alert.Id}", alert);
        });

        alerts.MapGet("/", async (
            string? endpoint,
            AlertStore store,
            CancellationToken cancellationToken) =>
        {
            if (string.IsNullOrEmpty(endpoint))
            {
                return Results.BadRequest(new { error = "endpoint required" });
            }

            return Results.Ok(await store.ListByEndpointAsync(endpoint, cancellationToken));
        });

        alerts.MapDelete("/{id}", async (
            string id,
            string? endpoint,
            AlertStore store,
            CancellationToken cancellationToken) =>
        {
            if (string.IsNullOrEmpty(endpoint))
            {
                return Results.BadRequest(new { error = "endpoint required" });
            }

            var alert = await store.GetAsync(id, cancellationToken);

            if (alert is null)
            {
                return Results.NotFound(new { error = "not found" });
            }

            if (alert.Endpoint != endpoint)
            {
                return Results.Json(new { error = "forbidden" }, statusCode: StatusCodes.Status403Forbidden);
            }

            await store.RemoveAsync(alert, cancellationToken);

            return Results.NoContent();
        });

        return app;
    }
}
