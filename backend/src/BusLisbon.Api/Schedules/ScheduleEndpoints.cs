namespace BusLisbon.Api.Schedules;

public static class ScheduleEndpoints
{
    public static IEndpointRouteBuilder MapScheduleEndpoints(this IEndpointRouteBuilder routes)
    {
        routes.MapGet("/api/arrivals/by-stop/{stopId}", async (
            string stopId,
            StopBoardService board,
            CancellationToken cancellationToken) =>
        {
            var entries = await board.ForStopAsync(stopId, cancellationToken);

            return Results.Ok(entries.Select(entry => new
            {
                lineId = WithoutAgency(entry.LineId),
                patternId = WithoutAgency(entry.PatternId),
                headsign = entry.Headsign,
                tripId = entry.TripId,
                vehicleId = entry.VehicleId,
                scheduledUnix = entry.ScheduledUnix,
                estimatedUnix = entry.EstimatedUnix,
                isPast = entry.IsPast,
                isRealtime = entry.IsRealtime,
                tripRunning = entry.TripRunning
            }).ToList());
        });

        return routes;
    }

    public static string WithoutAgency(string id)
    {
        var cut = id.LastIndexOf(']');

        return cut >= 0 && cut < id.Length - 1 ? id[(cut + 1)..] : id;
    }
}
