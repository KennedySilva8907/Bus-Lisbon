using BusLisbon.Api.Alerts;
using Microsoft.Extensions.Options;

namespace BusLisbon.Api.Endpoints;

public sealed record PendingAlertView(
    string Id,
    string LineId,
    string StopName,
    string VehicleId,
    int ThresholdMinutes,
    int MissCount,
    long AgeSeconds,
    string EndpointTail);

public sealed record AlertDiagnostics(int Pending, IReadOnlyList<PendingAlertView> Alerts);

public static class AlertDiagnosticsEndpoints
{
    private const int EndpointTailLength = 20;

    public static IEndpointRouteBuilder MapAlertDiagnosticsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/alerts/pending", async (
            HttpRequest request,
            AlertStore store,
            IOptions<DiagnosticsOptions> options,
            TimeProvider time,
            CancellationToken cancellationToken) =>
        {
            var secret = options.Value.Secret;

            if (secret.Length == 0 || request.Headers.Authorization != $"Bearer {secret}")
            {
                return Results.Unauthorized();
            }

            var pending = await store.ListPendingAsync(cancellationToken);
            var now = time.GetUtcNow().ToUnixTimeMilliseconds();

            var views = pending
                .OrderByDescending(alert => alert.CreatedAt)
                .Select(alert => new PendingAlertView(
                    alert.Id,
                    alert.LineId,
                    alert.StopName,
                    alert.VehicleId,
                    alert.ThresholdMinutes,
                    alert.MissCount ?? 0,
                    (now - alert.CreatedAt) / 1000,
                    Tail(alert.Endpoint)))
                .ToArray();

            return Results.Ok(new AlertDiagnostics(views.Length, views));
        });

        return app;
    }

    private static string Tail(string endpoint) =>
        endpoint.Length <= EndpointTailLength ? endpoint : endpoint[^EndpointTailLength..];
}

public sealed class DiagnosticsOptions
{
    public const string SectionName = "Diagnostics";

    public string Secret { get; set; } = string.Empty;
}
