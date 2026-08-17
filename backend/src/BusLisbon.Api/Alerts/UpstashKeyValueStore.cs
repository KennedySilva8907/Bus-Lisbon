using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;

namespace BusLisbon.Api.Alerts;

public sealed class UpstashKeyValueStore(HttpClient http) : IKeyValueStore
{
    private static readonly JsonSerializerOptions Payload = new(JsonSerializerDefaults.Web);

    public async Task<T?> GetAsync<T>(string key, CancellationToken cancellationToken)
    {
        var stored = await SendAsync<string>(["GET", key], cancellationToken);

        return stored is null ? default : JsonSerializer.Deserialize<T>(stored, Payload);
    }

    public async Task SetAsync<T>(
        string key, T value, TimeSpan? expiry, CancellationToken cancellationToken)
    {
        string[] command = expiry is { } window
            ? ["SET", key, JsonSerializer.Serialize(value, Payload), "EX", ((int)window.TotalSeconds).ToString()]
            : ["SET", key, JsonSerializer.Serialize(value, Payload)];

        await SendAsync<string>(command, cancellationToken);
    }

    public async Task DeleteAsync(string key, CancellationToken cancellationToken) =>
        await SendAsync<int>(["DEL", key], cancellationToken);

    public async Task SetAddAsync(string key, string member, CancellationToken cancellationToken) =>
        await SendAsync<int>(["SADD", key, member], cancellationToken);

    public async Task SetRemoveAsync(string key, string member, CancellationToken cancellationToken) =>
        await SendAsync<int>(["SREM", key, member], cancellationToken);

    public async Task<IReadOnlyList<string>> SetMembersAsync(
        string key, CancellationToken cancellationToken) =>
        await SendAsync<List<string>>(["SMEMBERS", key], cancellationToken) ?? [];

    private async Task<T?> SendAsync<T>(string[] command, CancellationToken cancellationToken)
    {
        var response = await http.PostAsJsonAsync(string.Empty, command, cancellationToken);

        response.EnsureSuccessStatusCode();

        var body = await response.Content.ReadFromJsonAsync<UpstashReply<T>>(
            Payload, cancellationToken);

        if (body?.Error is { Length: > 0 } error)
        {
            throw new AlertStoreException($"Upstash rejected {command[0]}: {error}");
        }

        return body is null ? default : body.Result;
    }

    public static IServiceCollection AddUpstash(IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<UpstashOptions>(configuration.GetSection(UpstashOptions.SectionName));

        services.AddHttpClient<IKeyValueStore, UpstashKeyValueStore>((provider, client) =>
        {
            var options = provider.GetRequiredService<IOptions<UpstashOptions>>().Value;

            if (!options.IsConfigured)
            {
                throw new AlertStoreException(
                    "Upstash:RestUrl and Upstash:RestToken must be configured for alerts to work");
            }

            client.BaseAddress = new Uri(options.RestUrl);
            client.Timeout = TimeSpan.FromSeconds(10);
            client.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", options.RestToken);
        });

        return services;
    }

    private sealed record UpstashReply<T>(
        [property: JsonPropertyName("result")] T? Result,
        [property: JsonPropertyName("error")] string? Error);
}

public sealed class AlertStoreException(string message) : Exception(message);
