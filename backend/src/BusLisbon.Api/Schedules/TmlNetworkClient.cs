using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Http.Resilience;
using Microsoft.Extensions.Options;
using Polly;
using Polly.Retry;

namespace BusLisbon.Api.Schedules;

public sealed class TmlEnvelope<T>
{
    [JsonPropertyName("data")]
    public T? Data { get; set; }
}

public sealed class TmlStop
{
    [JsonPropertyName("_id")]
    public long Id { get; set; }

    [JsonPropertyName("pattern_ids")]
    public List<string> PatternIds { get; set; } = [];
}

public interface ITmlNetwork
{
    Task<IReadOnlyList<TmlStop>> GetStopsAsync(CancellationToken cancellationToken);

    Task<TmlPattern?> GetPatternAsync(string patternId, CancellationToken cancellationToken);
}

public sealed class TmlNetworkClient(HttpClient http) : ITmlNetwork
{
    private static readonly JsonSerializerOptions SerializerOptions = new()
    {
        NumberHandling = JsonNumberHandling.AllowReadingFromString
    };

    public async Task<IReadOnlyList<TmlStop>> GetStopsAsync(CancellationToken cancellationToken)
    {
        var envelope = await http.GetFromJsonAsync<TmlEnvelope<List<TmlStop>>>(
            "/hub/api/v1/network/stops", SerializerOptions, cancellationToken);

        return envelope?.Data ?? throw new TmlFeedException("The stops feed returned no array");
    }

    public async Task<TmlPattern?> GetPatternAsync(string patternId, CancellationToken cancellationToken)
    {
        var response = await http.GetAsync(
            $"/hub/api/v1/network/patterns/{Uri.EscapeDataString(patternId)}", cancellationToken);

        if (response.StatusCode == HttpStatusCode.NotFound) return null;

        response.EnsureSuccessStatusCode();

        var envelope = await response.Content
            .ReadFromJsonAsync<TmlEnvelope<List<TmlPattern>>>(SerializerOptions, cancellationToken);

        return envelope?.Data?.FirstOrDefault();
    }

    public static IServiceCollection AddTmlNetwork(IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<TmlOptions>(configuration.GetSection(TmlOptions.SectionName));

        services.AddHttpClient<ITmlNetwork, TmlNetworkClient>((provider, client) =>
            {
                var options = provider.GetRequiredService<IOptions<TmlOptions>>().Value;

                client.BaseAddress = new Uri(options.BaseUrl);
                client.Timeout = TimeSpan.FromSeconds(60);
            })
            .ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler
            {
                AutomaticDecompression = DecompressionMethods.All,
                PooledConnectionLifetime = TimeSpan.FromMinutes(5)
            })
            .AddResilienceHandler("tml", pipeline =>
            {
                pipeline.AddRetry(new HttpRetryStrategyOptions
                {
                    MaxRetryAttempts = 3,
                    BackoffType = DelayBackoffType.Exponential,
                    Delay = TimeSpan.FromSeconds(1),
                    UseJitter = true
                });
            });

        services.AddHttpClient<ITmlArrivals, TmlArrivalsClient>((provider, client) =>
        {
            var options = provider.GetRequiredService<IOptions<TmlOptions>>().Value;

            client.BaseAddress = new Uri(options.BaseUrl);
            client.Timeout = TimeSpan.FromSeconds(20);
        });

        services.AddSingleton<PatternCatalogue>();
        services.AddSingleton<PassageLog>();

        return services;
    }
}

public sealed class TmlFeedException(string message) : Exception(message);
