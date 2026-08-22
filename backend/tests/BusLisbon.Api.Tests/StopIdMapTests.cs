using BusLisbon.Api.Schedules;

namespace BusLisbon.Api.Tests;

public class StopIdMapTests
{
    [Fact]
    public void CarriesTheWholeMappingCarrisPublish()
    {
        Assert.Equal(12752, StopIdMap.All.Count);
    }

    [Fact]
    public void TranslatesAStopThatWasRenumbered()
    {
        Assert.Equal("320973", StopIdMap.NetworkIdFor("020973"));
        Assert.Equal("320484", StopIdMap.NetworkIdFor("020484"));
        Assert.Equal("310009", StopIdMap.NetworkIdFor("010009"));
    }

    [Fact]
    public void LeavesAStopThatKeptItsNumberAlone()
    {
        Assert.Equal("110785", StopIdMap.NetworkIdFor("110785"));
    }

    [Fact]
    public void DoesNotFollowThePlus300000RuleWhereCarrisDoNot()
    {
        Assert.Equal("919893", StopIdMap.NetworkIdFor("060231"));
        Assert.Equal("754638", StopIdMap.NetworkIdFor("060289"));
        Assert.Equal("861821", StopIdMap.NetworkIdFor("061215"));
    }

    [Fact]
    public void SaysNothingForAStopItDoesNotKnow()
    {
        Assert.Null(StopIdMap.NetworkIdFor("123456"));
        Assert.Null(StopIdMap.NetworkIdFor(string.Empty));
    }
}
