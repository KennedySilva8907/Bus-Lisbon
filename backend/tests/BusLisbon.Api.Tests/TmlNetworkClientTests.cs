using System.Net;
using BusLisbon.Api.Schedules;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using WireMock.RequestBuilders;
using WireMock.ResponseBuilders;
using WireMock.Server;

namespace BusLisbon.Api.Tests;

public class TmlNetworkClientTests : IDisposable
{
    private const string TwoPlans = """
        {"data":[
          {"_id":"[LA77N]1713_0_2","line_id":"[LA77N]1713","headsign":"Expired",
           "trips":[{"schedule":[{"arrival_time":"07:00:00","stop_id":"120399","stop_sequence":3}],
                     "trip_ids":["[07MSC][LA77N]1713_0_2_0700"],"valid_on":["20260802"]}]},
          {"_id":"[LA77N]1713_0_2","line_id":"[LA77N]1713","headsign":"Current",
           "trips":[{"schedule":[{"arrival_time":"08:00:00","stop_id":"120399","stop_sequence":3}],
                     "trip_ids":["[9XPQ2][LA77N]1713_0_2_0800"],"valid_on":["20260821"]}]}
        ]}
        """;

    private readonly WireMockServer _network = WireMockServer.Start();

    private ITmlNetwork BuildClient()
    {
        var services = new ServiceCollection();
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Tml:BaseUrl"] = _network.Url
            })
            .Build();

        TmlNetworkClient.AddTmlNetwork(services, configuration);

        return services.BuildServiceProvider().GetRequiredService<ITmlNetwork>();
    }

    [Fact]
    public async Task ReadsEveryPlanThePatternComesWith()
    {
        _network
            .Given(Request.Create().WithPath("/hub/api/v1/network/patterns/*").UsingGet())
            .RespondWith(Response.Create().WithStatusCode(200)
                .WithHeader("Content-Type", "application/json").WithBody(TwoPlans));

        var plans = await BuildClient().GetPatternAsync("[LA77N]1713_0_2", CancellationToken.None);

        Assert.Equal(2, plans.Count);
        Assert.Equal(["Expired", "Current"], plans.Select(plan => plan.Headsign));
    }

    [Fact]
    public async Task FindsTodayInThePlanThatIsNotTheFirst()
    {
        _network
            .Given(Request.Create().WithPath("/hub/api/v1/network/patterns/*").UsingGet())
            .RespondWith(Response.Create().WithStatusCode(200)
                .WithHeader("Content-Type", "application/json").WithBody(TwoPlans));

        var lisbon = TimeZoneInfo.FindSystemTimeZoneById("Europe/Lisbon");
        var plans = await BuildClient().GetPatternAsync("[LA77N]1713_0_2", CancellationToken.None);

        var calls = plans
            .SelectMany(plan => ScheduleReader.CallsAt(plan, "120399", new DateOnly(2026, 8, 21), lisbon))
            .ToList();

        Assert.Single(calls);
        Assert.Equal("Current", calls[0].Headsign);
    }

    [Fact]
    public async Task GivesNoPlansForAPatternThatIsGone()
    {
        _network
            .Given(Request.Create().WithPath("/hub/api/v1/network/patterns/*").UsingGet())
            .RespondWith(Response.Create().WithStatusCode((int)HttpStatusCode.NotFound));

        Assert.Empty(await BuildClient().GetPatternAsync("[X]1_0_1", CancellationToken.None));
    }

    public void Dispose()
    {
        _network.Stop();
        _network.Dispose();
        GC.SuppressFinalize(this);
    }
}
