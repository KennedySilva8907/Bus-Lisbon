namespace BusLisbon.Api.Reliability;

public sealed record LinePunctuality(
    string LineId,
    int Passages,
    double AverageLatenessSeconds,
    int WithinTolerance,
    int Late,
    int Early,
    DateOnly FirstServiceDate,
    DateOnly LastServiceDate);
