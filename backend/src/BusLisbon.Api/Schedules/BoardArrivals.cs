using BusLisbon.Api.Carris;

namespace BusLisbon.Api.Schedules;

public sealed class BoardArrivals(StopBoardService board) : ICarrisArrivals
{
    public static CarrisArrival ToArrival(BoardEntry entry) => new()
    {
        LineId = ScheduleEndpoints.WithoutAgency(entry.LineId),
        PatternId = ScheduleEndpoints.WithoutAgency(entry.PatternId),
        VehicleId = entry.VehicleId,
        EstimatedArrivalUnix = entry.IsPast || !entry.IsRealtime ? null : entry.EstimatedUnix,
        ScheduledArrivalUnix = entry.ScheduledUnix,
        ObservedArrivalUnix = entry.IsPast && entry.IsRealtime ? entry.EstimatedUnix : null,
    };

    public async Task<IReadOnlyList<CarrisArrival>> GetArrivalsAsync(
        string stopId, CancellationToken cancellationToken) =>
        [.. (await board.ForStopAsync(stopId, cancellationToken)).Select(ToArrival)];
}
