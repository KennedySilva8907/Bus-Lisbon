using BusLisbon.Api.Endpoints;
using Microsoft.AspNetCore.Http;

namespace BusLisbon.Api.Tests;

public class AlertRateLimitTests
{
    private static HttpContext Request(string? forwardedFor = null, string? remote = null)
    {
        var context = new DefaultHttpContext();

        if (forwardedFor is not null) context.Request.Headers["X-Forwarded-For"] = forwardedFor;
        if (remote is not null) context.Connection.RemoteIpAddress = System.Net.IPAddress.Parse(remote);

        return context;
    }

    [Fact]
    public void CountsTheCallerBehindTheProxy()
    {
        Assert.Equal("203.0.113.7", AlertEndpoints.CallerOf(Request(forwardedFor: "203.0.113.7")));
    }

    [Fact]
    public void TakesTheFirstAddressWhenTheHeaderCarriesAChain()
    {
        Assert.Equal(
            "203.0.113.7",
            AlertEndpoints.CallerOf(Request(forwardedFor: "203.0.113.7, 70.41.3.18, 150.172.238.178")));
    }

    [Fact]
    public void FallsBackToTheConnectionWhenNothingWasForwarded()
    {
        Assert.Equal("198.51.100.4", AlertEndpoints.CallerOf(Request(remote: "198.51.100.4")));
    }

    [Fact]
    public void DoesNotLumpEveryUnknownCallerTogetherByAccident()
    {
        Assert.Equal("unknown", AlertEndpoints.CallerOf(Request()));
    }

    [Fact]
    public void LetsThroughMoreThanAPersonWouldEverNeed()
    {
        Assert.True(AlertEndpoints.WritesPerWindow >= 10);
        Assert.Equal(TimeSpan.FromMinutes(1), AlertEndpoints.Window);
    }
}
