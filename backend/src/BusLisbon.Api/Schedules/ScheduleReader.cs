using System.Globalization;

namespace BusLisbon.Api.Schedules;

public static class ScheduleReader
{
    public static long? SecondsIntoDay(string arrivalTime)
    {
        var parts = arrivalTime.Split(':');

        if (parts.Length != 3) return null;

        if (!int.TryParse(parts[0], NumberStyles.None, CultureInfo.InvariantCulture, out var hours)
            || !int.TryParse(parts[1], NumberStyles.None, CultureInfo.InvariantCulture, out var minutes)
            || !int.TryParse(parts[2], NumberStyles.None, CultureInfo.InvariantCulture, out var seconds))
        {
            return null;
        }

        if (minutes > 59 || seconds > 59) return null;

        return (hours * 3600L) + (minutes * 60L) + seconds;
    }

    public static long ToUnix(DateOnly serviceDate, long secondsIntoDay, TimeZoneInfo zone)
    {
        var midnight = serviceDate.ToDateTime(TimeOnly.MinValue);
        var offset = zone.GetUtcOffset(midnight);

        return new DateTimeOffset(midnight, offset).ToUnixTimeSeconds() + secondsIntoDay;
    }

    public const int OperationalDayStartsAt = 4;

    public static DateOnly OperationalDay(DateTimeOffset now, TimeZoneInfo zone)
    {
        var local = TimeZoneInfo.ConvertTime(now, zone);

        return DateOnly.FromDateTime(
            local.Hour < OperationalDayStartsAt ? local.AddDays(-1).DateTime : local.DateTime);
    }

    public static string TripKey(string tripId)
    {
        var cut = tripId.IndexOf(']');

        return cut >= 0 ? tripId[(cut + 1)..] : tripId;
    }

    public static bool RunsOn(TmlTripGroup group, DateOnly date) =>
        group.ValidOn.Contains(date.ToString("yyyyMMdd", CultureInfo.InvariantCulture));

    public static IReadOnlyList<ScheduledCall> CallsAt(
        TmlPattern pattern, string stopId, DateOnly date, TimeZoneInfo zone)
    {
        var calls = new List<ScheduledCall>();

        foreach (var group in pattern.Trips)
        {
            if (!RunsOn(group, date)) continue;

            var entry = group.Schedule.FirstOrDefault(s => s.StopId == stopId);

            if (entry is null || SecondsIntoDay(entry.ArrivalTime) is not { } seconds) continue;

            var last = group.Schedule.Count > 0
                && entry.StopSequence == group.Schedule.Max(s => s.StopSequence);

            calls.Add(new ScheduledCall(
                pattern.LineId,
                pattern.Id,
                pattern.Headsign,
                [.. group.TripIds.Select(TripKey)],
                ToUnix(date, seconds, zone),
                last,
                entry.StopSequence,
                group.Schedule));
        }

        return calls;
    }

}
