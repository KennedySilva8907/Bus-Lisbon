FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /source

COPY BusLisbon.sln .
COPY src/BusLisbon.Api/BusLisbon.Api.csproj src/BusLisbon.Api/
COPY src/BusLisbon.AlertJob/BusLisbon.AlertJob.csproj src/BusLisbon.AlertJob/
COPY tests/BusLisbon.Api.Tests/BusLisbon.Api.Tests.csproj tests/BusLisbon.Api.Tests/
RUN dotnet restore

COPY . .
RUN dotnet publish src/BusLisbon.Api/BusLisbon.Api.csproj -c Release -o /app/api
RUN dotnet publish src/BusLisbon.AlertJob/BusLisbon.AlertJob.csproj -c Release -o /app/job

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS job
WORKDIR /app
COPY --from=build /app/job .

ENTRYPOINT ["dotnet", "BusLisbon.AlertJob.dll"]

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app/api .

ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

ENTRYPOINT ["dotnet", "BusLisbon.Api.dll"]
