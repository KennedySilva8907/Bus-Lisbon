using BusLisbon.Api.Carris;
using BusLisbon.Api.Endpoints;
using BusLisbon.Api.Vehicles;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSingleton(TimeProvider.System);
CarrisClient.AddCarrisClient(builder.Services, builder.Configuration);
builder.Services.AddSingleton<VehicleGateway>();
builder.Services.AddSingleton<VehicleDemand>();
builder.Services.AddHostedService<CarrisPoller>();

var app = builder.Build();

app.MapHealthEndpoints();
app.MapVehicleEndpoints();

app.Run();

public partial class Program;
