using System.Net.Http.Headers;

namespace BusLisbon.Api.Tests;

public class CorsTests : IClassFixture<VehicleApiFactory>
{
    private const string AppOrigin = "https://buslisbon.vercel.app";

    private readonly VehicleApiFactory _factory;

    public CorsTests(VehicleApiFactory factory) => _factory = factory;

    private async Task<HttpResponseMessage> GetWithOriginAsync(string path, string origin)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, path);
        request.Headers.Add("Origin", origin);

        return await _factory.CreateClient().SendAsync(request);
    }

    [Fact]
    public async Task Health_LetsTheAppReadTheResponse()
    {
        var response = await GetWithOriginAsync("/health", AppOrigin);

        Assert.True(response.Headers.Contains("Access-Control-Allow-Origin"));
        Assert.Equal(AppOrigin, response.Headers.GetValues("Access-Control-Allow-Origin").Single());
    }

    [Fact]
    public async Task Vehicles_LetTheAppReadTheResponse()
    {
        var response = await GetWithOriginAsync("/api/vehicles/status", AppOrigin);

        Assert.Equal(AppOrigin, response.Headers.GetValues("Access-Control-Allow-Origin").Single());
    }

    [Fact]
    public async Task Vehicles_SayNothingToAnOriginWeDoNotKnow()
    {
        var response = await GetWithOriginAsync("/api/vehicles/status", "https://somebody-else.example");

        Assert.False(response.Headers.Contains("Access-Control-Allow-Origin"));
    }

    [Fact]
    public async Task Preflight_AllowsCredentialsSoTheHubCanConnect()
    {
        var request = new HttpRequestMessage(HttpMethod.Options, "/api/vehicles/status");
        request.Headers.Add("Origin", AppOrigin);
        request.Headers.Add("Access-Control-Request-Method", "POST");
        request.Headers.Add("Access-Control-Request-Headers", "x-requested-with");

        var response = await _factory.CreateClient().SendAsync(request);

        Assert.Equal(AppOrigin, response.Headers.GetValues("Access-Control-Allow-Origin").Single());
        Assert.Equal("true", response.Headers.GetValues("Access-Control-Allow-Credentials").Single());
    }
}
