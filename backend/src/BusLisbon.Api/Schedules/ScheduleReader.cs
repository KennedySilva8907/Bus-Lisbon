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

    public static string DepartureTag(string tripId)
    {
        var cut = tripId.LastIndexOf('|');

        return cut >= 0 && cut < tripId.Length - 1 ? tripId[(cut + 1)..] : string.Empty;
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

            var departure = group.TripIds.Select(DepartureTag).FirstOrDefault(tag => tag.Length > 0);

            if (departure is null) continue;

            calls.Add(new ScheduledCall(
                pattern.LineId, pattern.Id, pattern.Headsign, departure, ToUnix(date, seconds, zone)));
        }

        return calls;
    }

    public static long? ScheduledFor(
        TmlPattern pattern, string stopId, string tripId, DateOnly date, TimeZoneInfo zone)
    {
        var tag = DepartureTag(tripId);

        if (tag.Length == 0) return null;

        foreach (var group in pattern.Trips)
        {
            if (!RunsOn(group, date)) continue;
            if (!group.TripIds.Any(id => DepartureTag(id) == tag)) continue;

            var entry = group.Schedule.FirstOrDefault(s => s.StopId == stopId);

            if (entry is null || SecondsIntoDay(entry.ArrivalTime) is not { } seconds) continue;

            return ToUnix(date, seconds, zone);
        }

        return null;
    }
}
