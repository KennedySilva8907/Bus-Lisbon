namespace BusLisbon.Api.Alerts;

public interface IKeyValueStore
{
    Task<T?> GetAsync<T>(string key, CancellationToken cancellationToken);

    Task SetAsync<T>(string key, T value, TimeSpan? expiry, CancellationToken cancellationToken);

    Task DeleteAsync(string key, CancellationToken cancellationToken);

    Task SetAddAsync(string key, string member, CancellationToken cancellationToken);

    Task SetRemoveAsync(string key, string member, CancellationToken cancellationToken);

    Task<IReadOnlyList<string>> SetMembersAsync(string key, CancellationToken cancellationToken);
}
