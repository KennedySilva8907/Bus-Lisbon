using BusLisbon.Api.Alerts;
using Microsoft.Extensions.Options;

namespace BusLisbon.Api.Reliability;

public sealed class LineRankingPublisher(
    IKeyValueStore store,
    IOptions<ReliabilityOptions> options,
    TimeProvider time)
{
    public async Task PublishAsync(IReadOnlyList<LinePunctuality> lines, CancellationToken cancellationToken)
    {
        var ranking = new LineRanking(
            time.GetUtcNow().ToUnixTimeSeconds(),
            options.Value.ToleranceSeconds,
            lines.Select(line => new RankedLine(
                line.LineId,
                line.Passages,
                line.WithinTolerance,
                line.Late,
                line.Early,
                line.AverageLatenessSeconds,
                line.FirstServiceDate,
                line.LastServiceDate)).ToArray());

        await store.SetAsync(ReliabilityKeys.Summary, ranking, expiry: null, cancellationToken);
    }
}
