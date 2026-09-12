// <copyright file="Program.cs" company="Distributed Bidding Auction Platform">
// Copyright (c) Distributed Bidding Auction Platform. Licensed under the MIT license.
// </copyright>
using bidding_service.Data;
using bidding_service.Endpoints;
using bidding_service.Services;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Configuration.AddJsonFile(
    Path.Combine(builder.Environment.ContentRootPath, "appsettings.Development.local.json"),
    optional: true,
    reloadOnChange: true);
builder.Services.Configure<DatabaseOptions>(
    builder.Configuration.GetSection(DatabaseOptions.SectionName));
builder.Services.Configure<BidPlacementOptions>(
    builder.Configuration.GetSection(BidPlacementOptions.SectionName));
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

/// <summary>
/// Represents the program component.
/// </summary>
public partial class Program;
