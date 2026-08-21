using Microsoft.Extensions.Options;

namespace BusLisbon.Api.Schedules;

public sealed record StopSchedule(
    string LineId,
    string PatternId,
    string Headsign,
    string Departure,
    long ScheduledUnix);

public static class ScheduleEndpoints
{
    public static IEndpointRouteBuilder MapScheduleEndpoints(this IEndpointRouteBuilder routes)
    {
        routes.MapGet("/api/schedules/by-stop/{stopId}", async (
            string stopId,
            int? minutes,
            PatternCatalogue catalogue,
            IOptions<TmlOptions> options,
            TimeProvider clock,
            CancellationToken cancellationToken) =>
        {
            var zone = TimeZoneInfo.FindSystemTimeZoneById(options.Value.TimeZone);
            var now = clock.GetUtcNow().ToUnixTimeSeconds();
            var window = Window(minutes);
            var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(clock.GetUtcNow(), zone).DateTime);
            var patternIds = await catalogue.PatternIdsForAsync(stopId, cancellationToken);
            var calls = new List<StopSchedule>();

            foreach (var patternId in patternIds)
            {
                var pattern = await catalogue.PatternAsync(patternId, cancellationToken);

                if (pattern is null) continue;

                foreach (var call in ScheduleReader.CallsAt(pattern, stopId, today, zone))
                {
                    if (!Within(call.ScheduledUnix, now, window)) continue;

                    calls.Add(new StopSchedule(
                        LineName(call.LineId), call.PatternId, call.Headsign, call.Departure, call.ScheduledUnix));
                }
            }

            return Results.Ok(calls.OrderBy(call => call.ScheduledUnix).ToList());
        });

        return routes;
    }

    public const int DefaultMinutes = 120;

    public const int MaximumMinutes = 720;

    public static int Window(int? minutes) =>
        minutes is { } asked && asked > 0 ? Math.Min(asked, MaximumMinutes) : DefaultMinutes;

    public static bool Within(long scheduledUnix, long nowUnix, int minutes) =>
        scheduledUnix >= nowUnix - 60 && scheduledUnix <= nowUnix + (minutes * 60L);

    public static string LineName(string lineId)
    {
        var cut = lineId.LastIndexOf(']');

        return cut >= 0 && cut < lineId.Length - 1 ? lineId[(cut + 1)..] : lineId;
    }
}
