using bidding_service.Data;
using bidding_service.Endpoints;
using bidding_service.Services;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Configuration.AddJsonFile(Path.Combine(builder.Environment.ContentRootPath, "appsettings.Development.local.json"), optional: true, reloadOnChange: true);
builder.Services.Configure<DatabaseOptions>(builder.Configuration.GetSection(DatabaseOptions.SectionName));
builder.Services.Configure<BidPlacementOptions>(builder.Configuration.GetSection(BidPlacementOptions.SectionName));
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddDbContext<BiddingDbContext>(options =>
{
    var connectionString = builder.Configuration.GetConnectionString("BiddingDb")
        ?? throw new InvalidOperationException("Connection string 'BiddingDb' is not configured.");

    options.UseNpgsql(connectionString);
});
builder.Services.AddScoped<DatabaseInitializer>();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();

app.MapGet("/health", () => Results.Ok(new
{
    status = "ok",
    service = "bidding-service",
    checkedAtUtc = DateTimeOffset.UtcNow
}))
.WithName("Health");

app.MapAuctionEndpoints();

await using (var scope = app.Services.CreateAsyncScope())
{
    var initializer = scope.ServiceProvider.GetRequiredService<DatabaseInitializer>();
    await initializer.InitializeAsync();
}

app.Run();

public partial class Program;
