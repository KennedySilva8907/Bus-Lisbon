using System.Text.Json;
using BusLisbon.Api.Alerts;

namespace BusLisbon.Api.Tests;

public sealed class FakeKeyValueStore : IKeyValueStore
{
    private static readonly JsonSerializerOptions Payload = new(JsonSerializerDefaults.Web);

    private readonly Dictionary<string, string> _values = [];
    private readonly Dictionary<string, HashSet<string>> _sets = [];
    private readonly Dictionary<string, TimeSpan> _expiries = [];

    public IReadOnlyDictionary<string, TimeSpan> Expiries => _expiries;

    public bool Has(string key) => _values.ContainsKey(key);

    public IReadOnlyCollection<string> Members(string key) =>
        _sets.TryGetValue(key, out var members) ? members : [];

    public Task<T?> GetAsync<T>(string key, CancellationToken cancellationToken) =>
        Task.FromResult(_values.TryGetValue(key, out var stored)
            ? JsonSerializer.Deserialize<T>(stored, Payload)
            : default);

    public Task SetAsync<T>(string key, T value, TimeSpan? expiry, CancellationToken cancellationToken)
    {
        _values[key] = JsonSerializer.Serialize(value, Payload);

        if (expiry is { } window)
        {
            _expiries[key] = window;
        }
        else
        {
            _expiries.Remove(key);
        }

        return Task.CompletedTask;
    }

    public Task DeleteAsync(string key, CancellationToken cancellationToken)
    {
        _values.Remove(key);
        _expiries.Remove(key);

        return Task.CompletedTask;
    }

    public Task SetAddAsync(string key, string member, CancellationToken cancellationToken)
    {
        if (!_sets.TryGetValue(key, out var members))
        {
            members = [];
            _sets[key] = members;
        }

        members.Add(member);

        return Task.CompletedTask;
    }

    public Task SetRemoveAsync(string key, string member, CancellationToken cancellationToken)
    {
        if (_sets.TryGetValue(key, out var members))
        {
            members.Remove(member);
        }

        return Task.CompletedTask;
    }

    public Task<IReadOnlyList<string>> SetMembersAsync(string key, CancellationToken cancellationToken) =>
        Task.FromResult<IReadOnlyList<string>>(
            _sets.TryGetValue(key, out var members) ? [.. members] : []);
}
