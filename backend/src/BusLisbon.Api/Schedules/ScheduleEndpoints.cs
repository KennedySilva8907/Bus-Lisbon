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
            PassageLog passages,
            IOptions<TmlOptions> options,
            TimeProvider clock,
            CancellationToken cancellationToken) =>
        {
            passages.Wanted(stopId);

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

        routes.MapGet("/api/arrivals/by-stop/{stopId}", async (
            string stopId,
            PatternCatalogue catalogue,
            ITmlArrivals arrivals,
            IOptions<TmlOptions> options,
            TimeProvider clock,
            CancellationToken cancellationToken) =>
        {
            var zone = TimeZoneInfo.FindSystemTimeZoneById(options.Value.TimeZone);
            var now = clock.GetUtcNow().ToUnixTimeSeconds();
            var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(clock.GetUtcNow(), zone).DateTime);
            var patternIds = await catalogue.PatternIdsForAsync(stopId, cancellationToken);
            var timetable = new List<ScheduledCall>();

            foreach (var patternId in patternIds)
            {
                var pattern = await catalogue.PatternAsync(patternId, cancellationToken);

                if (pattern is null) continue;

                timetable.AddRange(ScheduleReader.CallsAt(pattern, stopId, today, zone));
            }

            var live = await arrivals.GetApproachingAsync(stopId, now, cancellationToken);
            var etas = live.Values
                .Select(trip => new LiveEta(trip.TripId, trip.PatternId, trip.EtaUnix))
                .ToList();

            var board = StopBoard.Build(timetable, etas, now, BehindWindow, AheadWindow);

            return Results.Ok(board.Select(entry => new
            {
                lineId = LineName(entry.LineId),
                patternId = entry.PatternId,
                headsign = entry.Headsign,
                tripId = entry.TripId,
                scheduledUnix = entry.ScheduledUnix,
                estimatedUnix = entry.EstimatedUnix,
                isPast = entry.IsPast,
                isRealtime = entry.IsRealtime
            }).ToList());
        });

        routes.MapGet("/api/passages/by-stop/{stopId}", (string stopId, PassageLog passages) =>
        {
            passages.Wanted(stopId);

            return Results.Ok(passages.At(stopId).Select(passage => new
            {
                lineId = LineName(passage.LineId),
                patternId = passage.PatternId,
                headsign = passage.Headsign,
                observedUnix = passage.ObservedUnix,
                scheduledUnix = passage.ScheduledUnix
            }).ToList());
        });

        return routes;
    }

    public static readonly TimeSpan BehindWindow = TimeSpan.FromHours(2);

    public static readonly TimeSpan AheadWindow = TimeSpan.FromHours(2);

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
