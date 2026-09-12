// <copyright file="Program.cs" company="Distributed Bidding Auction Platform">
// Copyright (c) Distributed Bidding Auction Platform. Licensed under the MIT license.
// </copyright>
using System.Security.Claims;
using System.Security.Cryptography;
using bidding_service.Data;
using bidding_service.Endpoints;
using bidding_service.Options;
using bidding_service.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

builder.Configuration.AddJsonFile(
    Path.Combine(builder.Environment.ContentRootPath, "appsettings.Development.local.json"),
    optional: true,
    reloadOnChange: true);
builder.Services.Configure<DatabaseOptions>(
    builder.Configuration.GetSection(DatabaseOptions.SectionName));
builder.Services.Configure<BidPlacementOptions>(
    builder.Configuration.GetSection(BidPlacementOptions.SectionName));
builder.Services.Configure<BiddingAuthenticationOptions>(
    builder.Configuration.GetSection(BiddingAuthenticationOptions.SectionName));
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<IBuyerIdentityResolver, BuyerIdentityResolver>();
builder.Services.AddDbContext<BiddingDbContext>(options =>
{
    var connectionString = builder.Configuration.GetConnectionString("BiddingDb")
        ?? throw new InvalidOperationException("Connection string 'BiddingDb' is not configured.");

    options.UseNpgsql(connectionString);
});
builder.Services.AddScoped<DatabaseInitializer>();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
var authenticationOptions = builder.Configuration
    .GetSection(BiddingAuthenticationOptions.SectionName)
    .Get<BiddingAuthenticationOptions>() ?? new();
var publicKeyPath = Path.IsPathRooted(authenticationOptions.PublicKeyPath)
    ? authenticationOptions.PublicKeyPath
    : Path.GetFullPath(Path.Combine(builder.Environment.ContentRootPath, authenticationOptions.PublicKeyPath));
var requiresConfiguredAuthentication = !builder.Environment.IsDevelopment()
    && !builder.Environment.IsEnvironment("Testing");
if (requiresConfiguredAuthentication
    && (string.IsNullOrWhiteSpace(authenticationOptions.Issuer)
        || string.IsNullOrWhiteSpace(authenticationOptions.Audience)
        || string.IsNullOrWhiteSpace(authenticationOptions.KeyId)
        || string.IsNullOrWhiteSpace(authenticationOptions.PublicKeyPath)
        || !File.Exists(publicKeyPath)))
{
    throw new InvalidOperationException(
        "Bidding Service authentication requires a configured issuer, audience, and public RSA key.");
}

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        var signingKey = LoadPublicKey(publicKeyPath);
        signingKey.KeyId = authenticationOptions.KeyId;
        options.MapInboundClaims = false;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKeyResolver = (_, _, kid, _) =>
                kid == authenticationOptions.KeyId ? [signingKey] : [],
            ValidateIssuer = true,
            ValidIssuer = authenticationOptions.Issuer,
            ValidateAudience = true,
            ValidAudience = authenticationOptions.Audience,
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromSeconds(30),
            NameClaimType = "name",
            RoleClaimType = "role"
        };
    });
builder.Services.AddAuthorizationBuilder()
    .AddPolicy("AuctionBid", policy => policy
        .RequireAuthenticatedUser()
        .RequireClaim("permissions", "auction.bid"))
    .AddPolicy("AuctionBuy", policy => policy
        .RequireAuthenticatedUser()
        .RequireClaim("permissions", "auction.buy"))
    .AddPolicy("AuctionManage", policy => policy
        .RequireAuthenticatedUser()
        .RequireClaim("permissions", "auction.manage"));
builder.Services.AddCors(options =>
{
    options.AddPolicy("LocalClient", policy =>
    {
        policy.WithOrigins("http://localhost:8000", "http://127.0.0.1:8000")
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();
app.UseCors("LocalClient");
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/health", () => Results.Ok(new
{
    status = "ok",
    service = "bidding-service",
    checkedAtUtc = DateTimeOffset.UtcNow
}))
.WithName("Health");

app.MapAuctionEndpoints();

if (app.Environment.IsEnvironment("Testing"))
{
    app.MapGet("/testing/authenticated-sub", (ClaimsPrincipal user) =>
        Results.Ok(new { sub = user.FindFirstValue("sub"), authenticated = user.Identity?.IsAuthenticated }))
        .RequireAuthorization("AuctionBid");
}

await using (var scope = app.Services.CreateAsyncScope())
{
    var initializer = scope.ServiceProvider.GetRequiredService<DatabaseInitializer>();
    await initializer.InitializeAsync();
}

app.Run();

static SecurityKey LoadPublicKey(string path)
{
    if (!File.Exists(path))
    {
        return new SymmetricSecurityKey(RandomNumberGenerator.GetBytes(32));
    }

    var rsa = RSA.Create();
    rsa.ImportFromPem(File.ReadAllText(path));
    return new RsaSecurityKey(rsa);
}

/// <summary>
/// Represents the program component.
/// </summary>
public partial class Program;
