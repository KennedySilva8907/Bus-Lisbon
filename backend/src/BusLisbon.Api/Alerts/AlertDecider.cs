using BusLisbon.Api.Carris;

namespace BusLisbon.Api.Alerts;

public enum AlertOutcome
{
    Wait,
    Fire,
    Expire,
    Missed
}

public sealed record AlertDecision(AlertOutcome Outcome, int MinutesToShow = 0, int MissCount = 0)
{
    public static readonly AlertDecision Wait = new(AlertOutcome.Wait);

    public static readonly AlertDecision Expire = new(AlertOutcome.Expire);
}

public static class AlertDecider
{
    public const int MaxMisses = 5;

    private const double FireToleranceMinutes = 1;
    private const int JustArrivedGraceSeconds = 60;

    public static AlertDecision Decide(
        Alert alert, IReadOnlyList<CarrisArrival> arrivals, DateTimeOffset now)
    {
        var nowSeconds = now.ToUnixTimeSeconds();
        var arrival = NextArrivalOf(alert.VehicleId, arrivals, nowSeconds);

        if (arrival?.ArrivalUnix is not { } arrivalUnix)
        {
            var misses = (alert.MissCount ?? 0) + 1;

            return misses >= MaxMisses
                ? AlertDecision.Expire
                : new AlertDecision(AlertOutcome.Missed, MissCount: misses);
        }

        var minutesAway = (arrivalUnix - nowSeconds) / 60d;

        if (minutesAway <= alert.ThresholdMinutes + FireToleranceMinutes)
        {
            return new AlertDecision(AlertOutcome.Fire, MinutesToShow: MinutesToShow(alert, minutesAway));
        }

        return alert.MissCount is > 0
            ? new AlertDecision(AlertOutcome.Missed, MissCount: 0)
            : AlertDecision.Wait;
    }

    private static CarrisArrival? NextArrivalOf(
        string vehicleId, IReadOnlyList<CarrisArrival> arrivals, long nowSeconds) =>
        arrivals
            .Where(arrival => arrival.VehicleId == vehicleId)
            .Where(arrival => arrival.ObservedArrivalUnix is null || arrival.ObservedArrivalUnix >= nowSeconds)
            .Where(arrival => arrival.ArrivalUnix > nowSeconds - JustArrivedGraceSeconds)
            .OrderBy(arrival => arrival.ArrivalUnix)
            .FirstOrDefault();

    private static int MinutesToShow(Alert alert, double minutesAway) =>
        Math.Min(alert.ThresholdMinutes, Math.Max(1, (int)Math.Round(minutesAway)));
}
