using BusLisbon.Api.Alerts;
using BusLisbon.Api.Carris;
using BusLisbon.Api.Endpoints;
using BusLisbon.Api.Realtime;
using BusLisbon.Api.Schedules;
using BusLisbon.Api.Vehicles;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddCors(options => options.AddDefaultPolicy(policy => policy
    .WithOrigins(builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [])
    .AllowAnyHeader()
    .AllowAnyMethod()
    .AllowCredentials()));
CarrisClient.AddCarrisClient(builder.Services, builder.Configuration);
TmlNetworkClient.AddTmlNetwork(builder.Services, builder.Configuration);
builder.Services.AddSingleton<VehicleGateway>();
builder.Services.AddSingleton<VehicleDemand>();
builder.Services.AddSingleton<VehicleSubscriptions>();
builder.Services.AddSingleton<IVehicleSender, SignalRVehicleSender>();
builder.Services.AddSingleton<IVehicleBroadcaster, VehicleBroadcaster>();
builder.Services.Configure<AlertOptions>(builder.Configuration.GetSection(AlertOptions.SectionName));
builder.Services.Configure<DiagnosticsOptions>(builder.Configuration.GetSection(DiagnosticsOptions.SectionName));
UpstashKeyValueStore.AddUpstash(builder.Services, builder.Configuration);
builder.Services.AddScoped<AlertStore>();
builder.Services.AddSignalR();
builder.Services.AddHostedService<CarrisPoller>();
builder.Services.AddHostedService<PassageWatcher>();

var app = builder.Build();

app.UseCors();

app.MapHealthEndpoints();
app.MapVehicleEndpoints();
app.MapAlertEndpoints();
app.MapAlertDiagnosticsEndpoints();
app.MapLineReliabilityEndpoints();
app.MapScheduleEndpoints();
app.MapHub<VehicleHub>("/hubs/vehicles");

app.Run();

public partial class Program;
