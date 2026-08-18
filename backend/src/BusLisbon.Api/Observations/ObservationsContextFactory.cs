using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace BusLisbon.Api.Observations;

public sealed class ObservationsContextFactory : IDesignTimeDbContextFactory<ObservationsContext>
{
    public ObservationsContext CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<ObservationsContext>()
            .UseSqlServer(Environment.GetEnvironmentVariable("ConnectionStrings__Observations"))
            .Options;

        return new ObservationsContext(options);
    }
}
