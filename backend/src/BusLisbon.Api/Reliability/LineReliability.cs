namespace BusLisbon.Api.Reliability;

public sealed class LineReliability
{
    public required string LineId { get; set; }

    public required int Passages { get; set; }

    public required double AverageLatenessSeconds { get; set; }

    public required int WithinTolerance { get; set; }

    public required int Late { get; set; }

    public required int Early { get; set; }

    public required DateOnly FirstServiceDate { get; set; }

    public required DateOnly LastServiceDate { get; set; }

    public required long ComputedAtUnix { get; set; }
}
