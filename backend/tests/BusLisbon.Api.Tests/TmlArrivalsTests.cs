using BusLisbon.Api.Schedules;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using WireMock.RequestBuilders;
using WireMock.ResponseBuilders;
using WireMock.Server;

namespace BusLisbon.Api.Tests;

public class TmlArrivalsTests : IDisposable
{
    private const string OneLiveOneDead = """
        {"data":[
          {"trip_id":"[0277F][BNA17]2769_0_1|150|3|0330","vehicle_id":"1868",
           "eta_seconds":120,"eta_at":1787340120000},
          {"trip_id":"[F1M13][A2L1N]4001_0_3|2100|1910","vehicle_id":"12644",
           "eta_seconds":98,"eta_at":1787335928000}
        ]}
        """;

    private readonly WireMockServer _feed = WireMockServer.Start();

    private ITmlArrivals BuildClient()
    {
        var services = new ServiceCollection();
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Tml:BaseUrl"] = _feed.Url
            })
            .Build();

        TmlNetworkClient.AddTmlNetwork(services, configuration);

        return services.BuildServiceProvider().GetRequiredService<ITmlArrivals>();
    }

    [Fact]
    public void TurnsTheMillisecondStampIntoSeconds()
    {
        Assert.Equal(1787340120, TmlArrivalsClient.EstimatedUnix(1787340120000));
    }

    [Fact]
    public void RefusesAStampThatIsMissingOrEmpty()
    {
        Assert.Null(TmlArrivalsClient.EstimatedUnix(null));
        Assert.Null(TmlArrivalsClient.EstimatedUnix(0));
        Assert.Null(TmlArrivalsClient.EstimatedUnix(double.NaN));
    }

    [Fact]
    public async Task KeepsTheTimeTheFeedGivesRatherThanCountingFromNow()
    {
        _feed
            .Given(Request.Create().WithPath("/hub/api/v1/realtime/eta/by-stop/*").UsingGet())
            .RespondWith(Response.Create().WithStatusCode(200)
                .WithHeader("Content-Type", "application/json").WithBody(OneLiveOneDead));

        var approaching = await BuildClient().GetApproachingAsync("110785", CancellationToken.None);

        Assert.Equal(2, approaching.Count);
        Assert.Equal(1787340120, approaching["[0277F][BNA17]2769_0_1|150|3|0330"].EtaUnix);
    }

    [Fact]
    public async Task LeavesADeadRowInThePastInsteadOfBringingItToNow()
    {
        _feed
            .Given(Request.Create().WithPath("/hub/api/v1/realtime/eta/by-stop/*").UsingGet())
            .RespondWith(Response.Create().WithStatusCode(200)
                .WithHeader("Content-Type", "application/json").WithBody(OneLiveOneDead));

        var approaching = await BuildClient().GetApproachingAsync("110785", CancellationToken.None);
        var dead = approaching["[F1M13][A2L1N]4001_0_3|2100|1910"];

        Assert.Equal(1787335928, dead.EtaUnix);
        Assert.True(dead.EtaUnix < 1787340120 - 4000);
    }

    public void Dispose()
    {
        _feed.Stop();
        _feed.Dispose();
        GC.SuppressFinalize(this);
    }
}
