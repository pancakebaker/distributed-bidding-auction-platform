using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using bidding_service.Contracts;
using bidding_service.Data;
using bidding_service.Domain;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace bidding_service.Tests;

public sealed class AuctionApiTests : IClassFixture<AuctionApiFactory>, IAsyncLifetime
{
    private readonly AuctionApiFactory _factory;
    private readonly HttpClient _client;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public AuctionApiTests(AuctionApiFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
    }

    public async Task InitializeAsync() => await _factory.ResetDatabaseAsync();

    public Task DisposeAsync() => Task.CompletedTask;

    [Fact]
    public async Task GetAuctions_ReturnsAuctionList()
    {
        var auctions = await _client.GetFromJsonAsync<List<AuctionSummaryResponse>>("/api/auctions", JsonOptions);

        Assert.NotNull(auctions);
        Assert.Contains(auctions, a => a.Title == "MacBook Pro");
        Assert.Contains(auctions, a => a.Title == "Camera");
        Assert.Contains(auctions, a => a.Title == "Gaming Console");
    }

    [Fact]
    public async Task GetAuction_ReturnsAuctionDetail()
    {
        var auction = await _client.GetFromJsonAsync<AuctionDetailResponse>($"/api/auctions/{TestAuctionData.OpenAuctionId}", JsonOptions);

        Assert.NotNull(auction);
        Assert.Equal("MacBook Pro", auction.Title);
        Assert.Equal("Open", auction.Status);
        Assert.Equal(1250m, auction.MinimumValidBid);
    }

    [Fact]
    public async Task GetAuction_WhenMissing_ReturnsNotFound()
    {
        var response = await _client.GetAsync($"/api/auctions/{Guid.NewGuid()}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        var error = await response.Content.ReadFromJsonAsync<ApiErrorResponse>(JsonOptions);
        Assert.Equal("auction_not_found", error?.Code);
    }

    [Fact]
    public async Task PlaceBid_WhenValid_AcceptsBid()
    {
        var response = await _client.PostAsJsonAsync($"/api/auctions/{TestAuctionData.OpenAuctionId}/bids", new PlaceBidRequest("dana", 1250m), JsonOptions);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var bid = await response.Content.ReadFromJsonAsync<PlaceBidResponse>(JsonOptions);
        Assert.NotNull(bid);
        Assert.Equal("dana", bid.BidderId);
        Assert.Equal(1250m, bid.Amount);
        Assert.Equal(1300m, bid.NextMinimumBid);
    }

    [Fact]
    public async Task PlaceBid_WhenBelowMinimum_RejectsBid()
    {
        var response = await _client.PostAsJsonAsync($"/api/auctions/{TestAuctionData.OpenAuctionId}/bids", new PlaceBidRequest("dana", 1249.99m), JsonOptions);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var error = await response.Content.ReadFromJsonAsync<ApiErrorResponse>(JsonOptions);
        Assert.Equal("bid_below_minimum", error?.Code);
    }

    [Fact]
    public async Task PlaceBid_OnScheduledAuction_RejectsBid()
    {
        var response = await _client.PostAsJsonAsync($"/api/auctions/{TestAuctionData.ScheduledAuctionId}/bids", new PlaceBidRequest("dana", 500m), JsonOptions);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var error = await response.Content.ReadFromJsonAsync<ApiErrorResponse>(JsonOptions);
        Assert.Equal("auction_not_open", error?.Code);
    }

    [Fact]
    public async Task PlaceBid_OnClosedAuction_RejectsBid()
    {
        var response = await _client.PostAsJsonAsync($"/api/auctions/{TestAuctionData.ClosedAuctionId}/bids", new PlaceBidRequest("dana", 500m), JsonOptions);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var error = await response.Content.ReadFromJsonAsync<ApiErrorResponse>(JsonOptions);
        Assert.Equal("auction_not_open", error?.Code);
    }

    [Fact]
    public async Task PlaceBid_AfterEndTime_RejectsBid()
    {
        var response = await _client.PostAsJsonAsync($"/api/auctions/{TestAuctionData.EndedOpenAuctionId}/bids", new PlaceBidRequest("dana", 500m), JsonOptions);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var error = await response.Content.ReadFromJsonAsync<ApiErrorResponse>(JsonOptions);
        Assert.Equal("auction_ended", error?.Code);
    }

    [Fact]
    public async Task PlaceBid_BeforeStartTime_RejectsBid()
    {
        var response = await _client.PostAsJsonAsync($"/api/auctions/{TestAuctionData.FutureOpenAuctionId}/bids", new PlaceBidRequest("dana", 500m), JsonOptions);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var error = await response.Content.ReadFromJsonAsync<ApiErrorResponse>(JsonOptions);
        Assert.Equal("auction_not_started", error?.Code);
    }

    [Fact]
    public async Task PlaceBid_WhenSuccessful_UpdatesAuctionState()
    {
        await _client.PostAsJsonAsync($"/api/auctions/{TestAuctionData.OpenAuctionId}/bids", new PlaceBidRequest("dana", 1250m), JsonOptions);

        var auction = await _client.GetFromJsonAsync<AuctionDetailResponse>($"/api/auctions/{TestAuctionData.OpenAuctionId}", JsonOptions);
        Assert.NotNull(auction);
        Assert.Equal(1250m, auction.CurrentBidAmount);
        Assert.Equal("dana", auction.CurrentBidderId);
        Assert.Equal(4, auction.Version);
    }

    [Fact]
    public async Task PlaceBid_WhenSuccessful_CreatesBidHistoryRecord()
    {
        await _client.PostAsJsonAsync($"/api/auctions/{TestAuctionData.OpenAuctionId}/bids", new PlaceBidRequest("dana", 1250m), JsonOptions);

        var bids = await _client.GetFromJsonAsync<List<BidResponse>>($"/api/auctions/{TestAuctionData.OpenAuctionId}/bids", JsonOptions);
        Assert.NotNull(bids);
        Assert.Equal("dana", bids[0].BidderId);
        Assert.Equal(1250m, bids[0].Amount);
        Assert.Equal(3, bids.Count);
    }
}

public sealed class AuctionApiFactory : WebApplicationFactory<Program>
{
    private readonly FixedTimeProvider _timeProvider = new(TestAuctionData.Now);
    private const string TestConnectionString = "Host=127.0.0.1;Port=55432;Database=auction_demo_tests;Username=auction_app;Password=change_me_in_local_env";

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.ConfigureAppConfiguration(config =>
        {
            config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:BiddingDb"] = TestConnectionString,
                ["Database:ApplyMigrations"] = "false",
                ["Database:SeedDemoData"] = "false"
            });
        });

        builder.ConfigureServices(services =>
        {
            services.RemoveAll<TimeProvider>();
            services.AddSingleton<TimeProvider>(_timeProvider);
        });
    }

    public async Task ResetDatabaseAsync()
    {
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BiddingDbContext>();
        await db.Database.EnsureDeletedAsync();
        await db.Database.MigrateAsync();
        await TestAuctionData.SeedAsync(db);
    }
}

public sealed class FixedTimeProvider(DateTimeOffset utcNow) : TimeProvider
{
    public override DateTimeOffset GetUtcNow() => utcNow;
}

public static class TestAuctionData
{
    public static readonly DateTimeOffset Now = new(2026, 09, 05, 12, 0, 0, TimeSpan.Zero);
    public static readonly Guid OpenAuctionId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    public static readonly Guid ScheduledAuctionId = Guid.Parse("22222222-2222-2222-2222-222222222222");
    public static readonly Guid ClosedAuctionId = Guid.Parse("33333333-3333-3333-3333-333333333333");
    public static readonly Guid EndedOpenAuctionId = Guid.Parse("44444444-4444-4444-4444-444444444444");
    public static readonly Guid FutureOpenAuctionId = Guid.Parse("55555555-5555-5555-5555-555555555555");

    public static async Task SeedAsync(BiddingDbContext db)
    {
        db.Auctions.AddRange(
            new Auction
            {
                Id = OpenAuctionId,
                Title = "MacBook Pro",
                Description = "Open test auction.",
                StartingPrice = 1000m,
                MinimumBidIncrement = 50m,
                CurrentBidAmount = 1200m,
                CurrentBidderId = "carol",
                StartTimeUtc = Now.AddHours(-1),
                EndTimeUtc = Now.AddHours(1),
                Status = AuctionStatus.Open,
                Version = 3,
                CreatedAtUtc = Now.AddDays(-1),
                UpdatedAtUtc = Now.AddMinutes(-5)
            },
            new Auction
            {
                Id = ScheduledAuctionId,
                Title = "Camera",
                Description = "Scheduled test auction.",
                StartingPrice = 500m,
                MinimumBidIncrement = 25m,
                StartTimeUtc = Now.AddHours(1),
                EndTimeUtc = Now.AddHours(2),
                Status = AuctionStatus.Scheduled,
                Version = 1,
                CreatedAtUtc = Now.AddDays(-1),
                UpdatedAtUtc = Now.AddDays(-1)
            },
            new Auction
            {
                Id = ClosedAuctionId,
                Title = "Gaming Console",
                Description = "Closed test auction.",
                StartingPrice = 300m,
                MinimumBidIncrement = 20m,
                CurrentBidAmount = 380m,
                CurrentBidderId = "erin",
                StartTimeUtc = Now.AddDays(-2),
                EndTimeUtc = Now.AddHours(-1),
                Status = AuctionStatus.Closed,
                Version = 2,
                CreatedAtUtc = Now.AddDays(-3),
                UpdatedAtUtc = Now.AddHours(-1)
            },
            new Auction
            {
                Id = EndedOpenAuctionId,
                Title = "Ended Open Auction",
                Description = "Status open but end time passed.",
                StartingPrice = 300m,
                MinimumBidIncrement = 20m,
                StartTimeUtc = Now.AddDays(-1),
                EndTimeUtc = Now.AddMinutes(-1),
                Status = AuctionStatus.Open,
                Version = 1,
                CreatedAtUtc = Now.AddDays(-2),
                UpdatedAtUtc = Now.AddDays(-2)
            },
            new Auction
            {
                Id = FutureOpenAuctionId,
                Title = "Future Open Auction",
                Description = "Status open but start time is future.",
                StartingPrice = 300m,
                MinimumBidIncrement = 20m,
                StartTimeUtc = Now.AddMinutes(1),
                EndTimeUtc = Now.AddHours(1),
                Status = AuctionStatus.Open,
                Version = 1,
                CreatedAtUtc = Now.AddDays(-1),
                UpdatedAtUtc = Now.AddDays(-1)
            });

        db.Bids.AddRange(
            new Bid { Id = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1"), AuctionId = OpenAuctionId, BidderId = "alice", Amount = 1000m, CreatedAtUtc = Now.AddMinutes(-40) },
            new Bid { Id = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2"), AuctionId = OpenAuctionId, BidderId = "carol", Amount = 1200m, CreatedAtUtc = Now.AddMinutes(-5) });

        await db.SaveChangesAsync();
    }
}
