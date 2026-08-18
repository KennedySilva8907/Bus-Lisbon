namespace BusLisbon.Api.Observations;

public sealed class ArrivalObservation
{
    public long Id { get; set; }

    public required string LineId { get; set; }

    public required string StopId { get; set; }

    public string? PatternId { get; set; }

    public required DateOnly ServiceDate { get; set; }

    public required long ScheduledUnix { get; set; }

    public long? EstimatedUnix { get; set; }

    public required long ObservedUnix { get; set; }

    public long LatenessSeconds => ObservedUnix - ScheduledUnix;

    public long? PredictionErrorSeconds => EstimatedUnix is { } estimated ? ObservedUnix - estimated : null;
}
