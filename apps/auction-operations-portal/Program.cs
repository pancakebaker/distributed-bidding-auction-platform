// <copyright file="Program.cs" company="Distributed Bidding Auction Platform">
// Copyright (c) Distributed Bidding Auction Platform. Licensed under the MIT license.
// </copyright>
using System.Diagnostics;
using System.Security.Claims;
using System.Threading.RateLimiting;
using AuctionOperationsPortal.Auth;
using AuctionOperationsPortal.Components;
using AuctionOperationsPortal.Data;
using AuctionOperationsPortal.Health;
using AuctionOperationsPortal.Hubs;
using AuctionOperationsPortal.Messaging;
using AuctionOperationsPortal.Notifications;
using AuctionOperationsPortal.Options;
using AuctionOperationsPortal.Persistence;
using AuctionOperationsPortal.Telemetry;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using OpenTelemetry.Metrics;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;

var builder = WebApplication.CreateBuilder(args);

builder.Host.UseDefaultServiceProvider((context, options) =>
{
    var validate = context.HostingEnvironment.IsDevelopment()
        || context.HostingEnvironment.IsEnvironment("Testing");
    options.ValidateScopes = validate;
    options.ValidateOnBuild = validate;
});

if (builder.Environment.IsDevelopment() || builder.Environment.IsEnvironment("Testing"))
{
    builder.Logging.ClearProviders();
    builder.Logging.AddConsole();
}

builder.Configuration.AddJsonFile(
    Path.Combine(builder.Environment.ContentRootPath, "appsettings.Development.local.json"),
    optional: true,
    reloadOnChange: true);
builder.Services.Configure<ObservabilityOptions>(
    builder.Configuration.GetSection(ObservabilityOptions.SectionName));
var observabilityOptions = builder.Configuration
    .GetSection(ObservabilityOptions.SectionName)
    .Get<ObservabilityOptions>() ?? new();
builder.Services.Configure<LaravelAuthOptions>(options =>
{
    builder.Configuration.GetSection(LaravelAuthOptions.SectionName).Bind(options);
    if (!Path.IsPathRooted(options.PublicKeyPath))
    {
        options.PublicKeyPath = Path.GetFullPath(
            Path.Combine(builder.Environment.ContentRootPath, options.PublicKeyPath));
    }
});
builder.Services.Configure<RabbitMqOptions>(
    builder.Configuration.GetSection(RabbitMqOptions.SectionName));
builder.Services.AddDbContext<AuctionOperationsDbContext>(options =>
{
    var connectionString = builder.Configuration.GetConnectionString("AuctionOperationsDb")
        ?? throw new InvalidOperationException(
            "Connection string 'AuctionOperationsDb' is not configured.");
    options.UseNpgsql(connectionString);
});
builder.Services.AddHealthChecks()
    .AddCheck<PortalDatabaseHealthCheck>("postgresql")
    .AddCheck<RabbitMqHealthCheck>("rabbitmq");
if (observabilityOptions.Enabled)
{
    var openTelemetry = builder.Services.AddOpenTelemetry()
        .ConfigureResource(resource => resource.AddService(
            observabilityOptions.ServiceName,
            serviceVersion: observabilityOptions.ServiceVersion));
    openTelemetry.WithTracing(tracing =>
    {
        tracing.AddSource(PortalTelemetry.ActivitySourceName)
            .AddAspNetCoreInstrumentation()
            .AddHttpClientInstrumentation()
            .AddEntityFrameworkCoreInstrumentation();
        if (observabilityOptions.UseConsoleExporter)
            tracing.AddConsoleExporter();
        if (Uri.TryCreate(
                observabilityOptions.OtlpEndpoint,
                UriKind.Absolute,
                out var tracingEndpoint))
            tracing.AddOtlpExporter(exporter => exporter.Endpoint = tracingEndpoint);
    });
    openTelemetry.WithMetrics(metrics =>
    {
        metrics.AddMeter(PortalTelemetry.MeterName)
            .AddAspNetCoreInstrumentation()
            .AddHttpClientInstrumentation();
        if (observabilityOptions.UseConsoleExporter)
            metrics.AddConsoleExporter();
        if (Uri.TryCreate(
                observabilityOptions.OtlpEndpoint,
                UriKind.Absolute,
                out var metricsEndpoint))
            metrics.AddOtlpExporter(exporter => exporter.Endpoint = metricsEndpoint);
    });
}
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<PortalReplayProtection>();
builder.Services.AddSingleton<LaravelTokenValidator>();
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        var authOptions = builder.Configuration
            .GetSection(LaravelAuthOptions.SectionName)
            .Get<LaravelAuthOptions>() ?? new();
        options.Cookie.Name = authOptions.CookieName;
        options.Cookie.HttpOnly = true;
        options.Cookie.SameSite = SameSiteMode.Lax;
        options.Cookie.SecurePolicy = builder.Environment.IsDevelopment()
            || builder.Environment.IsEnvironment("Testing")
            ? CookieSecurePolicy.SameAsRequest
            : CookieSecurePolicy.Always;
        options.ExpireTimeSpan = TimeSpan.FromSeconds(
            Math.Clamp(authOptions.CookieLifetimeSeconds, 60, 3600));
        options.SlidingExpiration = false;
        options.LoginPath = "/auth/required";
        options.AccessDeniedPath = "/auth/denied";
    });
var permission = builder.Configuration[$"{LaravelAuthOptions.SectionName}:Permission"]
    ?? "access-auction-operations";
builder.Services.AddAuthorizationBuilder()
    .AddPolicy("AuctionOperationsAdmin", policy => policy
        .RequireAuthenticatedUser()
        .RequireRole("admin")
        .RequireClaim("permission", permission));
builder.Services.AddCascadingAuthenticationState();
if (builder.Environment.IsEnvironment("Testing"))
    builder.Services.AddDataProtection().UseEphemeralDataProtectionProvider();
builder.Services.AddScoped<IActivityPersistence, ActivityPersistence>();
builder.Services.AddScoped<IRecentActivityQuery, RecentActivityQuery>();
builder.Services.AddScoped<IActivityHistoryQueryService, ActivityHistoryQueryService>();
builder.Services.AddScoped<IActivityReportService, ActivityReportService>();
builder.Services.AddSingleton<
    IActivityNotificationPublisher,
    SignalRActivityNotificationPublisher>();
builder.Services.AddSingleton<IntegrationEventMapper>();
builder.Services.AddSingleton<RabbitMqTopology>();
if (!builder.Environment.IsEnvironment("Testing"))
    builder.Services.AddHostedService<AuctionActivityConsumer>();
builder.Services.AddSignalR();
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.OnRejected = (_, _) =>
    {
        PortalTelemetry.ReportsRejected.Add(
            1,
            new KeyValuePair<string, object?>("reason", "rate_limit"));
        return ValueTask.CompletedTask;
    };
    options.AddPolicy("ActivityReport", context => RateLimitPartition.GetFixedWindowLimiter(
        context.User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? context.Connection.RemoteIpAddress?.ToString()
            ?? "anonymous",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 5,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0
        }));
});
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
app.Use(async (context, next) =>
{
    var logger = context.RequestServices
        .GetRequiredService<ILoggerFactory>()
        .CreateLogger("PortalRequest");
    using var scope = logger.BeginScope(new Dictionary<string, object?>
    {
        ["CorrelationId"] = context.Request.Headers["X-Correlation-ID"].FirstOrDefault(),
        ["TraceId"] = Activity.Current?.TraceId.ToString(),
        ["SpanId"] = Activity.Current?.SpanId.ToString()
    });
    await next();
});
app.UseAuthentication();
app.UseRateLimiter();
app.UseAuthorization();
app.UseAntiforgery();
app.MapHealthChecks("/health", new Microsoft.AspNetCore.Diagnostics.HealthChecks.HealthCheckOptions
{
    ResponseWriter = async (context, report) =>
    {
        context.Response.ContentType = "application/json";
        await context.Response.WriteAsJsonAsync(new
        {
            status = report.Status.ToString(),
            checks = report.Entries.ToDictionary(
                entry => entry.Key,
                entry => entry.Value.Status.ToString())
        });
    }
});
app.MapPost(
    "/auth/handoff",
    async (
        HttpContext context,
        LaravelTokenValidator validator,
        IOptions<LaravelAuthOptions> authOptions,
        ILogger<Program> logger) =>
{
    using var activity = PortalTelemetry.StartActivity("portal.auth.handoff");
    var form = await context.Request.ReadFormAsync(context.RequestAborted);
    var token = form["token"].ToString();
    try
    {
        var identity = validator.Validate(token);
        activity?.SetTag("auth.outcome", "accepted");
        var claims = new System.Security.Claims.ClaimsIdentity(
            CookieAuthenticationDefaults.AuthenticationScheme);
        claims.AddClaim(new(System.Security.Claims.ClaimTypes.NameIdentifier, identity.Subject));
        if (!string.IsNullOrWhiteSpace(identity.Email))
            claims.AddClaim(new(System.Security.Claims.ClaimTypes.Email, identity.Email));
        claims.AddClaim(new(System.Security.Claims.ClaimTypes.Role, identity.Role));
        claims.AddClaim(new("permission", authOptions.Value.Permission));
        await context.SignInAsync(
            CookieAuthenticationDefaults.AuthenticationScheme,
            new System.Security.Claims.ClaimsPrincipal(claims),
            new AuthenticationProperties
            {
                IsPersistent = false,
                ExpiresUtc = identity.ExpiresAt
            });
        return Results.Redirect("/activity/live");
    }
    catch (PortalTokenValidationException exception)
    {
        activity?.SetTag("auth.outcome", "rejected");
        activity?.SetTag("auth.failure_category", exception.Category);
        logger.LogWarning("Portal handoff rejected: {Category}", exception.Category);
        return Results.Text("Unauthorized", statusCode: StatusCodes.Status401Unauthorized);
    }
}).DisableAntiforgery();
app.MapPost("/auth/logout", async (HttpContext context, IOptions<LaravelAuthOptions> authOptions) =>
{
    await context.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
    return Results.Redirect(authOptions.Value.LaravelAdminUrl);
}).RequireAuthorization("AuctionOperationsAdmin").DisableAntiforgery();
app.MapGet(
    "/auth/required",
    (IOptions<LaravelAuthOptions> authOptions) =>
        Results.Redirect(authOptions.Value.LaravelAdminUrl));
app.MapGet(
    "/auth/denied",
    () => Results.Text("Access denied", statusCode: StatusCodes.Status403Forbidden));
app.MapGet("/activity/report.pdf", async (
    string? from,
    string? to,
    string? aggregateId,
    string? eventType,
    IActivityReportService reports,
    HttpContext context,
    ILogger<Program> logger) =>
{
    using var activity = PortalTelemetry.StartActivity("portal.report.request");
    var parsed = ActivityHistoryQueryParser.Parse(from, to, aggregateId, eventType, "1", "25");
    if (!parsed.IsValid)
    {
        PortalTelemetry.ReportsRejected.Add(
            1,
            new KeyValuePair<string, object?>("reason", "validation"));
        return Results.BadRequest(new { errors = parsed.Errors });
    }

    var query = parsed.Query!;
    var request = new ActivityReportRequest(
        query.FromUtc,
        query.ToUtc,
        query.AggregateId,
        query.EventType);
    try
    {
        var report = await reports.BuildAsync(request, context.RequestAborted);
        var pdf = await reports.GeneratePdfAsync(report, context.RequestAborted);
        var filename =
            $"auction-activity-{request.FromUtc!.Value:yyyy-MM-dd}-to-"
            + $"{request.ToUtc!.Value:yyyy-MM-dd}.pdf";
        return Results.File(pdf, "application/pdf", filename);
    }
    catch (ActivityReportValidationException exception)
    {
        return Results.BadRequest(new { errors = exception.Errors });
    }
    catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested)
    {
        return Results.Empty;
    }
    catch (Exception exception)
    {
        logger.LogError(
            exception,
            "Activity PDF report generation failed for user {UserId}.",
            context.User.FindFirstValue(ClaimTypes.NameIdentifier));
        return Results.Problem(
            "Unable to generate the activity report.",
            statusCode: StatusCodes.Status500InternalServerError);
    }
}).RequireAuthorization("AuctionOperationsAdmin").RequireRateLimiting("ActivityReport");
app.MapHub<ActivityHub>("/hubs/activity").RequireAuthorization("AuctionOperationsAdmin");
app.MapStaticAssets();
app.MapRazorComponents<App>().AddInteractiveServerRenderMode();
app.Run();

/// <summary>Exposes the entry point for integration tests.</summary>
public partial class Program;
