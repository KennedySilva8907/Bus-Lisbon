using BusLisbon.Api.Alerts;
using BusLisbon.Api.Carris;
using BusLisbon.Api.Observations;
using BusLisbon.Api.Reliability;
using BusLisbon.Api.Schedules;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace BusLisbon.CollectionJob;

public static class ArrivalCollectionJob
{
    private const string ConnectionName = "Observations";

    public static async Task<int> Main(string[] args)
    {
        var builder = Host.CreateApplicationBuilder(args);

        builder.Services.AddSingleton(TimeProvider.System);
        CarrisClient.AddCarrisClient(builder.Services, builder.Configuration);
        TmlNetworkClient.AddTmlNetwork(builder.Services, builder.Configuration);
        builder.Services.AddScoped<IPassageObserver, PassageObserver>();
        UpstashKeyValueStore.AddUpstash(builder.Services, builder.Configuration);
        builder.Services.Configure<CollectionOptions>(
            builder.Configuration.GetSection(CollectionOptions.SectionName));
        builder.Services.Configure<ReliabilityOptions>(
            builder.Configuration.GetSection(ReliabilityOptions.SectionName));
        builder.Services.AddDbContext<ObservationsContext>(options => options
            .UseSqlServer(
                builder.Configuration.GetConnectionString(ConnectionName),
                sql => sql.EnableRetryOnFailure(maxRetryCount: 8, maxRetryDelay: TimeSpan.FromSeconds(30), errorNumbersToAdd: null)));
        builder.Services.AddScoped<ArrivalCollector>();
        builder.Services.AddScoped<LinePunctualityQuery>();
        builder.Services.AddScoped<LineRankingPublisher>();

        using var host = builder.Build();
        using var scope = host.Services.CreateScope();

        var logger = scope.ServiceProvider.GetRequiredService<ILogger<CollectionReport>>();
        var started = TimeProvider.System.GetTimestamp();

        try
        {
            var collector = scope.ServiceProvider.GetRequiredService<ArrivalCollector>();
            var report = await collector.CollectOnceAsync(SampleStops.All, CancellationToken.None);

            logger.LogInformation(
                "Watched {StopsRead} of {StopsTotal} stops in {Elapsed}s: {Seen} buses standing at one of them, {Written} written, {StopsFailed} feed failures",
                report.StopsRead,
                SampleStops.All.Count,
                (int)TimeProvider.System.GetElapsedTime(started).TotalSeconds,
                report.Seen,
                report.Written,
                report.StopsFailed);

            var lines = await scope.ServiceProvider
                .GetRequiredService<LinePunctualityQuery>()
                .RunAsync(CancellationToken.None);

            await scope.ServiceProvider
                .GetRequiredService<LineRankingPublisher>()
                .PublishAsync(lines, CancellationToken.None);

            logger.LogInformation("Published the ranking for {Lines} lines", lines.Count);

            return 0;
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "The arrival collection could not run");

            return 1;
        }
    }
}
