using BusLisbon.Api.Observations;
using Microsoft.EntityFrameworkCore;

namespace BusLisbon.Api.Reliability;

public sealed record SummaryReport(int Lines);

public sealed class LineSummaryWriter(
    ObservationsContext database,
    LinePunctualityQuery query,
    TimeProvider time)
{
    public async Task<SummaryReport> RewriteAsync(CancellationToken cancellationToken)
    {
        var lines = await query.RunAsync(cancellationToken);
        var computedAt = time.GetUtcNow().ToUnixTimeSeconds();

        await database.LineReliability.ExecuteDeleteAsync(cancellationToken);

        database.LineReliability.AddRange(lines.Select(line => new LineReliability
        {
            LineId = line.LineId,
            Passages = line.Passages,
            AverageLatenessSeconds = line.AverageLatenessSeconds,
            WithinTolerance = line.WithinTolerance,
            Late = line.Late,
            Early = line.Early,
            FirstServiceDate = line.FirstServiceDate,
            LastServiceDate = line.LastServiceDate,
            ComputedAtUnix = computedAt,
        }));

        await database.SaveChangesAsync(cancellationToken);
        database.ChangeTracker.Clear();

        return new SummaryReport(lines.Count);
    }
}
