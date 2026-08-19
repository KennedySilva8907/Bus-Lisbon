namespace BusLisbon.Api.Reliability;

public sealed record RankedLine(
    string LineId,
    int Passages,
    int WithinTolerance,
    int Late,
    int Early,
    double AverageLatenessSeconds,
    DateOnly FirstServiceDate,
    DateOnly LastServiceDate);

public sealed record LineRanking(
    long ComputedAtUnix,
    int ToleranceSeconds,
    IReadOnlyList<RankedLine> Lines);
