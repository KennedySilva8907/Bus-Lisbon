using BusLisbon.Api.Alerts;
using BusLisbon.Api.Carris;
using BusLisbon.Api.Schedules;
using BusLisbon.Api.Vehicles;
using Lib.Net.Http.WebPush;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace BusLisbon.AlertJob;

public static class AlertCheckJob
{
    public static async Task<int> Main(string[] args)
    {
        var builder = Host.CreateApplicationBuilder(args);

        builder.Services.AddSingleton(TimeProvider.System);
        CarrisClient.AddCarrisClient(builder.Services, builder.Configuration);
        TmlNetworkClient.AddTmlNetwork(builder.Services, builder.Configuration);
        builder.Services.AddSingleton<VehicleGateway>();
        builder.Services.AddScoped<ICarrisArrivals, BoardArrivals>();
        UpstashKeyValueStore.AddUpstash(builder.Services, builder.Configuration);
        builder.Services.Configure<VapidOptions>(builder.Configuration.GetSection(VapidOptions.SectionName));
        builder.Services.Configure<AlertOptions>(builder.Configuration.GetSection(AlertOptions.SectionName));
        builder.Services.AddHttpClient<PushServiceClient>();
        builder.Services.AddScoped<AlertStore>();
        builder.Services.AddScoped<IAlertNotifier, WebPushAlertNotifier>();
        builder.Services.AddScoped<AlertChecker>();

        using var host = builder.Build();
        using var scope = host.Services.CreateScope();

        var logger = scope.ServiceProvider.GetRequiredService<ILogger<AlertCheckReport>>();
        var started = TimeProvider.System.GetTimestamp();

        try
        {
            var checker = scope.ServiceProvider.GetRequiredService<AlertChecker>();
            var report = await checker.CheckOnceAsync(CancellationToken.None);

            logger.LogInformation(
                "Checked {Checked} alerts in {Elapsed}ms: {Fired} fired, {Expired} expired, {StopsFailed} stops unavailable",
                report.Checked,
                (int)TimeProvider.System.GetElapsedTime(started).TotalMilliseconds,
                report.Fired,
                report.Expired,
                report.StopsFailed);

            return 0;
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "The alert check could not run");

            return 1;
        }
    }
}
