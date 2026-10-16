namespace BusLisbon.Api.Schedules;

public readonly record struct ShapePass(double Along, double Offset);

public sealed class RouteShape
{
    public const double StopReachMetres = 60;
    public const double BusReachMetres = 100;
    public const double TieMetres = 15;
    public const double BackslideMetres = 30;
    public const double PastTheStopMetres = 30;
    public const double SameStopMetres = 25;

    private readonly IReadOnlyList<Place> points;
    private readonly double[] distances;
    private readonly List<(Place Stop, double Along)> stops = [];

    public RouteShape(IReadOnlyList<Place> points, IReadOnlyList<Place> stopsInOrder)
    {
        this.points = points;
        distances = new double[points.Count];

        for (var i = 1; i < points.Count; i++)
        {
            distances[i] = distances[i - 1] + StopBoard.Metres(points[i - 1].Lat, points[i - 1].Lon, points[i].Lat, points[i].Lon);
        }

        double? hint = null;

        foreach (var stop in stopsInOrder)
        {
            if (Locate(stop, hint) is not { } along) continue;

            stops.Add((stop, along));
            hint = along;
        }
    }

    public bool HasLeft(Place stop, Place bus)
    {
        var visits = stops
            .Where(placed => StopBoard.Metres(placed.Stop.Lat, placed.Stop.Lon, stop.Lat, stop.Lon) <= SameStopMetres)
            .Select(placed => placed.Along)
            .ToList();
        var passes = Passes(bus, BusReachMetres);

        if (visits.Count == 0 || passes.Count == 0) return false;

        var closest = passes.Min(pass => pass.Offset);
        var (busAlong, stopAlong) = passes
            .Where(pass => pass.Offset <= closest + TieMetres)
            .SelectMany(pass => visits.Select(visit => (Bus: pass.Along, Stop: visit)))
            .MinBy(pair => Math.Abs(pair.Bus - pair.Stop));

        return busAlong > stopAlong + PastTheStopMetres;
    }

    private double? Locate(Place place, double? hint)
    {
        var passes = Passes(place, StopReachMetres);

        if (passes.Count == 0) return null;

        if (hint is { } after)
        {
            var ahead = passes.Where(pass => pass.Along >= after - BackslideMetres).ToList();

            if (ahead.Count > 0)
            {
                var closest = ahead.Min(pass => pass.Offset);

                return ahead.First(pass => pass.Offset <= closest + TieMetres).Along;
            }
        }

        return passes.MinBy(pass => pass.Offset).Along;
    }

    private List<ShapePass> Passes(Place place, double reach)
    {
        var found = new List<ShapePass>();
        var inside = false;

        for (var i = 0; i < points.Count - 1; i++)
        {
            var a = points[i];
            var b = points[i + 1];
            var squeeze = Math.Cos(a.Lat * Math.PI / 180);
            var dx = (b.Lon - a.Lon) * squeeze;
            var dy = b.Lat - a.Lat;
            var px = (place.Lon - a.Lon) * squeeze;
            var py = place.Lat - a.Lat;
            var length = dx * dx + dy * dy;
            var t = length == 0 ? 0 : Math.Clamp((px * dx + py * dy) / length, 0, 1);
            var offset = StopBoard.Metres(a.Lat + (b.Lat - a.Lat) * t, a.Lon + (b.Lon - a.Lon) * t, place.Lat, place.Lon);

            if (offset > reach)
            {
                inside = false;
                continue;
            }

            var pass = new ShapePass(distances[i] + (distances[i + 1] - distances[i]) * t, offset);

            if (!inside)
            {
                found.Add(pass);
            }
            else if (offset < found[^1].Offset)
            {
                found[^1] = pass;
            }

            inside = true;
        }

        return found;
    }
}
