using AuctionOperationsPortal.Auth;
using AuctionOperationsPortal.Components;
using AuctionOperationsPortal.Data;
using AuctionOperationsPortal.Hubs;
using AuctionOperationsPortal.Messaging;
using AuctionOperationsPortal.Notifications;
using AuctionOperationsPortal.Options;
using AuctionOperationsPortal.Persistence;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

var builder = WebApplication.CreateBuilder(args);

if (builder.Environment.IsDevelopment() || builder.Environment.IsEnvironment("Testing"))
{
    builder.Logging.ClearProviders();
    builder.Logging.AddConsole();
}

builder.Configuration.AddJsonFile(Path.Combine(builder.Environment.ContentRootPath, "appsettings.Development.local.json"), optional: true, reloadOnChange: true);
builder.Services.Configure<LaravelAuthOptions>(options =>
{
    builder.Configuration.GetSection(LaravelAuthOptions.SectionName).Bind(options);
    if (!Path.IsPathRooted(options.PublicKeyPath))
        options.PublicKeyPath = Path.GetFullPath(Path.Combine(builder.Environment.ContentRootPath, options.PublicKeyPath));
});
builder.Services.Configure<RabbitMqOptions>(builder.Configuration.GetSection(RabbitMqOptions.SectionName));
builder.Services.AddDbContext<AuctionOperationsDbContext>(options =>
{
    var connectionString = builder.Configuration.GetConnectionString("AuctionOperationsDb")
        ?? throw new InvalidOperationException("Connection string 'AuctionOperationsDb' is not configured.");
    options.UseNpgsql(connectionString);
});
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<PortalReplayProtection>();
builder.Services.AddSingleton<LaravelTokenValidator>();
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        var authOptions = builder.Configuration.GetSection(LaravelAuthOptions.SectionName).Get<LaravelAuthOptions>() ?? new();
        options.Cookie.Name = authOptions.CookieName;
        options.Cookie.HttpOnly = true;
        options.Cookie.SameSite = SameSiteMode.Lax;
        options.Cookie.SecurePolicy = builder.Environment.IsDevelopment() || builder.Environment.IsEnvironment("Testing")
            ? CookieSecurePolicy.SameAsRequest
            : CookieSecurePolicy.Always;
        options.ExpireTimeSpan = TimeSpan.FromSeconds(Math.Clamp(authOptions.CookieLifetimeSeconds, 60, 3600));
        options.SlidingExpiration = false;
        options.LoginPath = "/auth/required";
        options.AccessDeniedPath = "/auth/denied";
    });
builder.Services.AddAuthorizationBuilder()
    .AddPolicy("AuctionOperationsAdmin", policy => policy
        .RequireAuthenticatedUser()
        .RequireRole("admin")
        .RequireClaim("permission", builder.Configuration[$"{LaravelAuthOptions.SectionName}:Permission"] ?? "access-auction-operations"));
builder.Services.AddCascadingAuthenticationState();
if (builder.Environment.IsEnvironment("Testing"))
    builder.Services.AddDataProtection().UseEphemeralDataProtectionProvider();
builder.Services.AddScoped<IActivityPersistence, ActivityPersistence>();
builder.Services.AddScoped<IRecentActivityQuery, RecentActivityQuery>();
builder.Services.AddSingleton<IActivityNotificationPublisher, SignalRActivityNotificationPublisher>();
builder.Services.AddSingleton<IntegrationEventMapper>();
builder.Services.AddSingleton<RabbitMqTopology>();
if (!builder.Environment.IsEnvironment("Testing"))
    builder.Services.AddHostedService<AuctionActivityConsumer>();
builder.Services.AddSignalR();
builder.Services.AddRazorComponents().AddInteractiveServerComponents();

var app = builder.Build();
if (!app.Environment.IsDevelopment() && !app.Environment.IsEnvironment("Testing"))
{
    app.UseExceptionHandler("/Error", createScopeForErrors: true);
    app.UseHsts();
}

if (!app.Environment.IsEnvironment("Testing"))
    app.UseHttpsRedirection();
app.UseRouting();
app.UseAuthentication();
app.UseAuthorization();
app.UseAntiforgery();
app.MapPost("/auth/handoff", async (HttpContext context, LaravelTokenValidator validator, IOptions<LaravelAuthOptions> authOptions, ILogger<Program> logger) =>
{
    var form = await context.Request.ReadFormAsync(context.RequestAborted);
    var token = form["token"].ToString();
    try
    {
        var identity = validator.Validate(token);
        var claims = new System.Security.Claims.ClaimsIdentity(CookieAuthenticationDefaults.AuthenticationScheme);
        claims.AddClaim(new(System.Security.Claims.ClaimTypes.NameIdentifier, identity.Subject));
        if (!string.IsNullOrWhiteSpace(identity.Email))
            claims.AddClaim(new(System.Security.Claims.ClaimTypes.Email, identity.Email));
        claims.AddClaim(new(System.Security.Claims.ClaimTypes.Role, identity.Role));
        claims.AddClaim(new("permission", authOptions.Value.Permission));
        await context.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, new System.Security.Claims.ClaimsPrincipal(claims), new AuthenticationProperties
        {
            IsPersistent = false,
            ExpiresUtc = identity.ExpiresAt
        });
        return Results.Redirect("/");
    }
    catch (PortalTokenValidationException exception)
    {
        logger.LogWarning("Portal handoff rejected: {Category}", exception.Category);
        return Results.Text("Unauthorized", statusCode: StatusCodes.Status401Unauthorized);
    }
}).DisableAntiforgery();
app.MapPost("/auth/logout", async (HttpContext context, IOptions<LaravelAuthOptions> authOptions) =>
{
    await context.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
    return Results.Redirect(authOptions.Value.LaravelAdminUrl);
}).RequireAuthorization("AuctionOperationsAdmin").DisableAntiforgery();
app.MapGet("/auth/required", (IOptions<LaravelAuthOptions> authOptions) => Results.Redirect(authOptions.Value.LaravelAdminUrl));
app.MapGet("/auth/denied", () => Results.Text("Access denied", statusCode: StatusCodes.Status403Forbidden));
app.MapHub<ActivityHub>("/hubs/activity").RequireAuthorization("AuctionOperationsAdmin");
app.MapStaticAssets();
app.MapRazorComponents<App>().AddInteractiveServerRenderMode();
app.Run();

/// <summary>Exposes the entry point for integration tests.</summary>
public partial class Program;
