using AuctionOperationsPortal.Components;
using AuctionOperationsPortal.Data;
using AuctionOperationsPortal.Messaging;
using AuctionOperationsPortal.Options;
using AuctionOperationsPortal.Persistence;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

if (builder.Environment.IsDevelopment() || builder.Environment.IsEnvironment("Testing"))
{
    builder.Logging.ClearProviders();
    builder.Logging.AddConsole();
}

builder.Configuration.AddJsonFile(Path.Combine(builder.Environment.ContentRootPath, "appsettings.Development.local.json"), optional: true, reloadOnChange: true);
builder.Services.Configure<RabbitMqOptions>(builder.Configuration.GetSection(RabbitMqOptions.SectionName));
builder.Services.AddDbContext<AuctionOperationsDbContext>(options =>
{
    var connectionString = builder.Configuration.GetConnectionString("AuctionOperationsDb")
        ?? throw new InvalidOperationException("Connection string 'AuctionOperationsDb' is not configured.");
    options.UseNpgsql(connectionString);
});
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddScoped<IActivityPersistence, ActivityPersistence>();
builder.Services.AddSingleton<IntegrationEventMapper>();
builder.Services.AddSingleton<RabbitMqTopology>();
builder.Services.AddHostedService<AuctionActivityConsumer>();
builder.Services.AddRazorComponents().AddInteractiveServerComponents();

var app = builder.Build();
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error", createScopeForErrors: true);
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseAntiforgery();
app.MapStaticAssets();
app.MapRazorComponents<App>().AddInteractiveServerRenderMode();
app.Run();

/// <summary>Exposes the entry point for integration tests.</summary>
public partial class Program;
