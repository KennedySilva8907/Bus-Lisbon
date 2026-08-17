using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Http.Resilience;
using Microsoft.Extensions.Options;
using Polly;
using Polly.Retry;

namespace BusLisbon.Api.Carris;

public sealed class CarrisClient(HttpClient http) : ICarrisClient, ICarrisArrivals
{
    private static readonly JsonSerializerOptions SerializerOptions = new()
    {
        NumberHandling = JsonNumberHandling.AllowReadingFromString
    };

    public async Task<IReadOnlyList<CarrisVehicle>> GetVehiclesAsync(CancellationToken cancellationToken)
    {
        var vehicles = await http.GetFromJsonAsync<List<CarrisVehicle>>(
            "/v2/vehicles", SerializerOptions, cancellationToken);

        return vehicles ?? throw new CarrisFeedException("The vehicles feed returned no array");
    }

    public async Task<IReadOnlyList<CarrisArrival>> GetArrivalsAsync(
        string stopId, CancellationToken cancellationToken)
    {
        var arrivals = await http.GetFromJsonAsync<List<CarrisArrival>>(
            $"/stops/{Uri.EscapeDataString(stopId)}/realtime", SerializerOptions, cancellationToken);

        return arrivals ?? throw new CarrisFeedException($"The arrivals feed for stop {stopId} returned no array");
    }

    public static IServiceCollection AddCarrisClient(IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<CarrisOptions>(configuration.GetSection(CarrisOptions.SectionName));

        Configure(services.AddHttpClient<ICarrisClient, CarrisClient>(Connect));
        Configure(services.AddHttpClient<ICarrisArrivals, CarrisClient>(Connect));

        return services;
    }

    private static void Connect(IServiceProvider provider, HttpClient client)
    {
        var options = provider.GetRequiredService<IOptions<CarrisOptions>>().Value;

        client.BaseAddress = new Uri(options.BaseUrl);
        client.Timeout = TimeSpan.FromSeconds(30);
    }

    private static void Configure(IHttpClientBuilder builder) =>
        builder
            .ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler
            {
                AutomaticDecompression = DecompressionMethods.All,
                PooledConnectionLifetime = TimeSpan.FromMinutes(5)
            })
            .AddResilienceHandler("carris", pipeline =>
            {
                pipeline.AddRetry(new HttpRetryStrategyOptions
                {
                    MaxRetryAttempts = 3,
                    BackoffType = DelayBackoffType.Exponential,
                    Delay = TimeSpan.FromSeconds(1),
                    UseJitter = true
                });

                pipeline.AddCircuitBreaker(new HttpCircuitBreakerStrategyOptions
                {
                    FailureRatio = 1.0,
                    MinimumThroughput = 4,
                    SamplingDuration = TimeSpan.FromSeconds(30),
                    BreakDuration = TimeSpan.FromSeconds(30)
                });
            });
}

public sealed class CarrisFeedException(string message) : Exception(message);
