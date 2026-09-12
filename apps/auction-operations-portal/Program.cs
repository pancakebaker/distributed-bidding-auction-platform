// <copyright file="Program.cs" company="Distributed Bidding Auction Platform">
// Copyright (c) Distributed Bidding Auction Platform. Licensed under the MIT license.
// </copyright>
using System.Diagnostics;
using System.Net;
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
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.HttpOverrides;
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
builder.Services.Configure<SystemAdminAuthOptions>(options =>
{
    builder.Configuration.GetSection(SystemAdminAuthOptions.SectionName).Bind(options);
    if (!Path.IsPathRooted(options.PrivateKeyPath))
    {
        options.PrivateKeyPath = Path.GetFullPath(
            Path.Combine(builder.Environment.ContentRootPath, options.PrivateKeyPath));
    }
});
builder.Services.Configure<SystemAdminDemoOptions>(options =>
    builder.Configuration.GetSection(SystemAdminDemoOptions.SectionName).Bind(options));
builder.Services.Configure<SystemAdminSessionOptions>(options =>
    builder.Configuration.GetSection(SystemAdminSessionOptions.SectionName).Bind(options));
builder.Services.Configure<LiveFeedAdminOptions>(options =>
    builder.Configuration.GetSection(LiveFeedAdminOptions.SectionName).Bind(options));
builder.Services.PostConfigure<SystemAdminDemoOptions>(options =>
{
    var configuredPassword = builder.Configuration["SYSTEM_ADMIN_DEMO_PASSWORD"];
    if (!string.IsNullOrWhiteSpace(configuredPassword))
        options.Password = configuredPassword;
});
var systemAdminAuthOptions = builder.Configuration
    .GetSection(SystemAdminAuthOptions.SectionName)
    .Get<SystemAdminAuthOptions>() ?? new();
if (!Path.IsPathRooted(systemAdminAuthOptions.PrivateKeyPath))
{
    systemAdminAuthOptions.PrivateKeyPath = Path.GetFullPath(
        Path.Combine(builder.Environment.ContentRootPath, systemAdminAuthOptions.PrivateKeyPath));
}
systemAdminAuthOptions.Validate(
    builder.Environment.IsDevelopment() || builder.Environment.IsEnvironment("Testing"));
var systemAdminSessionOptions = builder.Configuration
    .GetSection(SystemAdminSessionOptions.SectionName)
    .Get<SystemAdminSessionOptions>() ?? new();
var configuredDataProtectionPath = builder.Configuration["DATA_PROTECTION_KEYS_PATH"];
if (!string.IsNullOrWhiteSpace(configuredDataProtectionPath))
{
    systemAdminSessionOptions.DataProtectionKeysPath = Path.GetFullPath(
        Path.Combine(builder.Environment.ContentRootPath, configuredDataProtectionPath));
}
systemAdminSessionOptions.Validate(
    builder.Environment.IsDevelopment() || builder.Environment.IsEnvironment("Testing"));
var liveFeedAdminOptions = builder.Configuration
    .GetSection(LiveFeedAdminOptions.SectionName)
    .Get<LiveFeedAdminOptions>() ?? new();
liveFeedAdminOptions.Validate(
    builder.Environment.IsDevelopment() || builder.Environment.IsEnvironment("Testing"));
builder.Services.Configure<RabbitMqOptions>(
    builder.Configuration.GetSection(RabbitMqOptions.SectionName));
builder.Services.PostConfigure<RabbitMqOptions>(options =>
    RabbitMqOptions.ApplyEnvironmentOverrides(options, builder.Configuration));
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
builder.Services.AddSingleton<Microsoft.AspNetCore.Identity.IPasswordHasher<SystemAdminUser>, Microsoft.AspNetCore.Identity.PasswordHasher<SystemAdminUser>>();
builder.Services.AddScoped<ISystemAdminAccountService, SystemAdminAccountService>();
builder.Services.AddScoped<SystemAdminSeeder>();
builder.Services.AddSingleton<ISystemAdminTokenIssuer, SystemAdminTokenIssuer>();
builder.Services.AddHttpClient<ILiveFeedAdminHandoffClient, LiveFeedAdminHandoffClient>(client =>
{
    client.BaseAddress = new Uri(liveFeedAdminOptions.BaseUrl, UriKind.Absolute);
    client.Timeout = TimeSpan.FromSeconds(10);
});
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.Cookie.Name = systemAdminSessionOptions.CookieName;
        options.Cookie.HttpOnly = true;
        options.Cookie.SameSite = SameSiteMode.Lax;
        options.Cookie.SecurePolicy = builder.Environment.IsDevelopment()
            || builder.Environment.IsEnvironment("Testing")
            ? CookieSecurePolicy.SameAsRequest
            : CookieSecurePolicy.Always;
        options.ExpireTimeSpan = TimeSpan.FromMinutes(systemAdminSessionOptions.LifetimeMinutes);
        options.SlidingExpiration = false;
        options.LoginPath = "/login";
        options.AccessDeniedPath = "/auth/denied";
    });
builder.Services.AddAuthorizationBuilder()
    .AddPolicy("AuctionOperationsAdmin", policy => policy
        .RequireAuthenticatedUser()
        .RequireRole(SystemAdminRoles.SystemAdministrator)
        .RequireClaim("permission", SystemAdminPermissions.Monitor));
builder.Services.AddAuthorizationBuilder()
    .AddPolicy("SystemAdminLiveFeed", policy => policy
        .RequireAuthenticatedUser()
        .RequireRole(SystemAdminRoles.SystemAdministrator)
        .RequireClaim("permission", SystemAdminPermissions.LiveFeedAdmin));
builder.Services.AddCascadingAuthenticationState();
if (builder.Environment.IsEnvironment("Testing"))
{
    builder.Services.AddDataProtection().UseEphemeralDataProtectionProvider();
}
else if (!string.IsNullOrWhiteSpace(systemAdminSessionOptions.DataProtectionKeysPath))
{
    builder.Services.AddDataProtection().PersistKeysToFileSystem(
        new DirectoryInfo(systemAdminSessionOptions.DataProtectionKeysPath));
}

builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.ForwardLimit = 1;
    var configuredProxies = builder.Configuration["TRUSTED_PROXY_IPS"]?
        .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries) ?? [];
    foreach (var proxy in configuredProxies)
    {
        if (!IPAddress.TryParse(proxy, out var address))
            throw new InvalidOperationException("TRUSTED_PROXY_IPS contains an invalid IP address.");
        options.KnownProxies.Add(address);
    }
});
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
    options.AddPolicy("SystemAdminLogin", context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "anonymous",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = builder.Environment.IsEnvironment("Testing") ? 1_000 : 10,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0
        }));
    options.AddPolicy("SystemAdminLiveFeedAccess", context => RateLimitPartition.GetFixedWindowLimiter(
        context.User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? context.Connection.RemoteIpAddress?.ToString()
            ?? "anonymous",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = builder.Environment.IsEnvironment("Testing") ? 1_000 : 10,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0
        }));
});
builder.Services.AddRazorComponents().AddInteractiveServerComponents();

var app = builder.Build();
if (app.Environment.IsDevelopment())
{
    using var scope = app.Services.CreateScope();
    var demoOptions = scope.ServiceProvider.GetRequiredService<IOptions<SystemAdminDemoOptions>>();
    if (demoOptions.Value.Enabled)
        await scope.ServiceProvider.GetRequiredService<SystemAdminSeeder>().SeedAsync();
}
if (!app.Environment.IsDevelopment() && !app.Environment.IsEnvironment("Testing"))
{
    app.UseExceptionHandler("/Error", createScopeForErrors: true);
    app.UseHsts();
}

app.UseForwardedHeaders();
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
app.Use(async (context, next) =>
{
    if (context.Request.Path.StartsWithSegments("/auth")
        || context.Request.Path.StartsWithSegments("/activity")
        || context.Request.Path.StartsWithSegments("/hubs"))
    {
        context.Response.Headers.CacheControl = "no-store";
        context.Response.Headers.Pragma = "no-cache";
        context.Response.Headers["X-Content-Type-Options"] = "nosniff";
        context.Response.Headers["Referrer-Policy"] = "no-referrer";
        context.Response.Headers["X-Frame-Options"] = "DENY";
    }
    await next();
});
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
    "/auth/login",
    async (
        HttpContext context,
        ISystemAdminAccountService accounts,
        IOptions<SystemAdminSessionOptions> sessionOptions,
        ILogger<Program> logger) =>
    {
        using var activity = PortalTelemetry.StartActivity("portal.auth.login");
        var form = await context.Request.ReadFormAsync(context.RequestAborted);
        var email = form["email"].ToString();
        var password = form["password"].ToString();
        var returnUrl = form["returnUrl"].ToString();
        var user = await accounts.FindActiveByEmailAsync(email, context.RequestAborted);
        var valid = user is not null
            && string.Equals(user.Role, SystemAdminRoles.SystemAdministrator, StringComparison.Ordinal)
            && accounts.VerifyPassword(user, password) == Microsoft.AspNetCore.Identity.PasswordVerificationResult.Success;
        if (!valid)
        {
            activity?.SetTag("auth.outcome", "rejected");
            logger.LogWarning("System-admin login failed: invalid credentials.");
            return Results.Text("Invalid email or password.", statusCode: StatusCodes.Status401Unauthorized);
        }

        var claims = new ClaimsIdentity(CookieAuthenticationDefaults.AuthenticationScheme);
        claims.AddClaim(new Claim(ClaimTypes.NameIdentifier, user!.SubjectId));
        claims.AddClaim(new Claim(ClaimTypes.Email, user.Email));
        claims.AddClaim(new Claim(ClaimTypes.Role, SystemAdminRoles.SystemAdministrator));
        foreach (var systemPermission in SystemAdminPermissions.ForRole(user.Role))
            claims.AddClaim(new Claim("permission", systemPermission));
        await context.SignInAsync(
            CookieAuthenticationDefaults.AuthenticationScheme,
            new ClaimsPrincipal(claims),
            new AuthenticationProperties
            {
                IsPersistent = false,
                ExpiresUtc = DateTimeOffset.UtcNow.AddMinutes(sessionOptions.Value.LifetimeMinutes)
            });
        activity?.SetTag("auth.outcome", "accepted");
        logger.LogInformation("System-admin login succeeded for subject {SubjectId}.", user.SubjectId);
        return Results.Redirect(IsSafeLocalReturnUrl(returnUrl) ? returnUrl : "/");
    })
    .RequireRateLimiting("SystemAdminLogin")
    .WithMetadata(new RequireAntiforgeryTokenAttribute());
app.MapPost(
    "/admin/live-feed/access",
    async (
        HttpContext context,
        ISystemAdminAccountService accounts,
        ISystemAdminTokenIssuer tokenIssuer,
        ILiveFeedAdminHandoffClient handoffClient,
        IOptions<LiveFeedAdminOptions> options,
        ILogger<Program> logger) =>
    {
        var subjectId = context.User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(subjectId))
            return Results.Forbid();

        var user = await accounts.FindActiveBySubjectIdAsync(subjectId, context.RequestAborted);
        if (user is null)
            return Results.Forbid();

        try
        {
            var token = tokenIssuer.Issue(user, "live-feed-admin");
            var code = await handoffClient.CreateHandoffAsync(token, context.RequestAborted);
            var destination = new Uri(
                new Uri(options.Value.BaseUrl, UriKind.Absolute),
                options.Value.BrowserHandoffEndpoint + "?code=" + Uri.EscapeDataString(code));
            return Results.Redirect(destination.ToString());
        }
        catch (LiveFeedAdminHandoffException exception)
        {
            logger.LogWarning(exception, "Live Feed system-admin handoff was unavailable.");
            return Results.Problem(
                "Live Feed admin access is temporarily unavailable.",
                statusCode: StatusCodes.Status503ServiceUnavailable);
        }
    })
    .RequireAuthorization("SystemAdminLiveFeed")
    .RequireRateLimiting("SystemAdminLiveFeedAccess")
    .WithMetadata(new RequireAntiforgeryTokenAttribute());
app.MapPost("/auth/logout", async (HttpContext context) =>
{
    await context.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
    return Results.Redirect("/login");
}).RequireAuthorization("AuctionOperationsAdmin")
    .WithMetadata(new RequireAntiforgeryTokenAttribute());
app.MapGet(
    "/auth/required",
    (HttpContext context) => Results.Redirect(
        "/login?returnUrl=" + Uri.EscapeDataString(context.Request.Query["returnUrl"].ToString())));
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

static bool IsSafeLocalReturnUrl(string? returnUrl) =>
    !string.IsNullOrWhiteSpace(returnUrl)
    && returnUrl.StartsWith('/')
    && (returnUrl.Length == 1 || (returnUrl[1] != '/' && returnUrl[1] != '\\'))
    && !returnUrl.Contains('\\', StringComparison.Ordinal)
    && !returnUrl.Contains('\r', StringComparison.Ordinal)
    && !returnUrl.Contains('\n', StringComparison.Ordinal);

/// <summary>Exposes the entry point for integration tests.</summary>
public partial class Program;
