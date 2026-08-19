using System.Net.Http.Json;
using BusLisbon.Api.Alerts;
using BusLisbon.Api.Carris;
using BusLisbon.Api.Reliability;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Time.Testing;

namespace BusLisbon.Api.Tests;

public class LineReliabilityEndpointTests : IClassFixture<RankingApiFactory>
{
    private readonly RankingApiFactory _factory;

    public LineReliabilityEndpointTests(RankingApiFactory factory) => _factory = factory;

    private static LinePunctuality Line(string lineId, int passages, int within) =>
        new(lineId, passages, -42.5, within, passages - within, 0, new DateOnly(2026, 8, 18), new DateOnly(2026, 8, 19));

    private async Task PublishAsync(params LinePunctuality[] lines)
    {
        var publisher = new LineRankingPublisher(
            _factory.Store,
            Options.Create(new ReliabilityOptions { ToleranceSeconds = 300 }),
            new FakeTimeProvider(DateTimeOffset.Parse("2026-08-19T01:40:00Z")));

        await publisher.PublishAsync(lines, CancellationToken.None);
    }

    [Fact]
    public async Task WithNothingPublishedItAnswersAnEmptyRanking()
    {
        _factory.WithFreshStore();

        var ranking = await _factory.CreateClient().GetFromJsonAsync<LineRanking>("/api/lines/reliability");

        Assert.Equal(0, ranking!.ComputedAtUnix);
        Assert.Empty(ranking.Lines);
    }

    [Fact]
    public async Task ItServesWhatTheNightJobPublished()
    {
        _factory.WithFreshStore();
        await PublishAsync(Line("1005", 126, 126), Line("1702", 60, 13));

        var ranking = await _factory.CreateClient().GetFromJsonAsync<LineRanking>("/api/lines/reliability");

        Assert.Equal(300, ranking!.ToleranceSeconds);
        Assert.Equal(DateTimeOffset.Parse("2026-08-19T01:40:00Z").ToUnixTimeSeconds(), ranking.ComputedAtUnix);
        Assert.Equal(["1005", "1702"], ranking.Lines.Select(line => line.LineId));
        Assert.Equal(126, ranking.Lines[0].WithinTolerance);
        Assert.Equal(-42.5, ranking.Lines[0].AverageLatenessSeconds);
        Assert.Equal(new DateOnly(2026, 8, 18), ranking.Lines[0].FirstServiceDate);
    }

    [Fact]
    public async Task ThePublishedRankingDoesNotExpire()
    {
        _factory.WithFreshStore();
        await PublishAsync(Line("1005", 126, 126));

        var store = (FakeKeyValueStore)_factory.Store;

        Assert.True(store.Has(ReliabilityKeys.Summary));
        Assert.DoesNotContain(ReliabilityKeys.Summary, store.Expiries.Keys);
    }

    [Fact]
    public async Task PublishingAgainReplacesTheRanking()
    {
        _factory.WithFreshStore();
        await PublishAsync(Line("1005", 126, 126), Line("1702", 60, 13));
        await PublishAsync(Line("2222", 76, 76));

        var ranking = await _factory.CreateClient().GetFromJsonAsync<LineRanking>("/api/lines/reliability");

        Assert.Equal(["2222"], ranking!.Lines.Select(line => line.LineId));
    }
}

public sealed class RankingApiFactory : WebApplicationFactory<Program>
{
    private FakeKeyValueStore _store = new();

    public IKeyValueStore Store => _store;

    public RankingApiFactory WithFreshStore()
    {
        _store = new FakeKeyValueStore();

        return this;
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.ConfigureServices(services =>
        {
            services.RemoveAll<ICarrisClient>();
            services.AddSingleton<ICarrisClient, SilentCarrisClient>();
            services.RemoveAll<IKeyValueStore>();
            services.AddScoped<IKeyValueStore>(_ => _store);
        });
    }

    private sealed class SilentCarrisClient : ICarrisClient
    {
        public Task<IReadOnlyList<CarrisVehicle>> GetVehiclesAsync(CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<CarrisVehicle>>([]);
    }
}
