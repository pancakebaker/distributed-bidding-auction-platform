using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using DistributedBidding.IntegrationContracts;
using bidding_service.Contracts;
using bidding_service.Data;
using bidding_service.Domain;
using bidding_service.Services;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;

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
        var auction = await GetOpenAuctionAsync();

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
        var response = await PlaceBidAsync("dana", 1250m);

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
        var response = await PlaceBidAsync("dana", 1249.99m);

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
        await PlaceBidAsync("dana", 1250m);

        var auction = await GetOpenAuctionAsync();
        Assert.Equal(1250m, auction.CurrentBidAmount);
        Assert.Equal("dana", auction.CurrentBidderId);
        Assert.Equal(4, auction.Version);
    }

    [Fact]
    public async Task PlaceBid_WhenSuccessful_CreatesBidHistoryRecord()
    {
        await PlaceBidAsync("dana", 1250m);

        var bids = await GetOpenAuctionBidsAsync();
        Assert.Equal("dana", bids[0].BidderId);
        Assert.Equal(1250m, bids[0].Amount);
        Assert.Equal(3, bids.Count);
    }

    [Fact]
    public async Task PlaceBid_WhenAccepted_CreatesBidAcceptedOutboxMessage()
    {
        var response = await PlaceBidAsync("dana", 1250m);
        var acceptedBid = await response.Content.ReadFromJsonAsync<PlaceBidResponse>(JsonOptions);
        var messages = await GetOutboxMessagesAsync();

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.NotNull(acceptedBid);
        var message = Assert.Single(messages);
        Assert.Equal(IntegrationEventTypes.BidAccepted, message.EventType);
        Assert.Equal(AggregateTypes.Auction, message.AggregateType);
        Assert.Equal(TestAuctionData.OpenAuctionId, message.AggregateId);
        Assert.Equal(acceptedBid.AuctionVersion, message.AggregateVersion);
        Assert.Null(message.PublishedAtUtc);
        Assert.Equal(0, message.PublishAttempts);

        var payload = JsonSerializer.Deserialize<BidAcceptedPayload>(message.Payload, JsonOptions);
        Assert.NotNull(payload);
        Assert.Equal(acceptedBid.BidId, payload.BidId);
        Assert.Equal(TestAuctionData.OpenAuctionId, payload.AuctionId);
        Assert.Equal("dana", payload.BidderId);
        Assert.Equal(1250m, payload.Amount);
        Assert.Equal(acceptedBid.AuctionVersion, payload.AuctionVersion);
    }

    [Fact]
    public async Task PlaceBid_WithCorrelationHeader_PreservesCorrelationIdInResponseHeaderAndOutbox()
    {
        const string correlationId = "phase3-correlation-123";
        var response = await PlaceBidAsync("dana", 1250m, correlationId);
        var acceptedBid = await response.Content.ReadFromJsonAsync<PlaceBidResponse>(JsonOptions);
        var message = Assert.Single(await GetOutboxMessagesAsync());

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.NotNull(acceptedBid);
        Assert.Equal(correlationId, acceptedBid.CorrelationId);
        Assert.True(response.Headers.TryGetValues("X-Correlation-ID", out var values));
        Assert.Equal(correlationId, Assert.Single(values));
        Assert.Equal(correlationId, message.CorrelationId);
    }

    [Fact]
    public async Task PlaceBid_WithoutCorrelationHeader_GeneratesCorrelationId()
    {
        var response = await PlaceBidAsync("dana", 1250m);
        var acceptedBid = await response.Content.ReadFromJsonAsync<PlaceBidResponse>(JsonOptions);
        var message = Assert.Single(await GetOutboxMessagesAsync());

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.NotNull(acceptedBid);
        Assert.False(string.IsNullOrWhiteSpace(acceptedBid.CorrelationId));
        Assert.Equal(acceptedBid.CorrelationId, message.CorrelationId);
        Assert.True(Guid.TryParse(acceptedBid.CorrelationId, out _));
    }

    [Fact]
    public async Task PlaceBid_WhenBelowMinimum_DoesNotCreateOutboxMessage()
    {
        var response = await PlaceBidAsync("dana", 1249.99m);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(0, await GetOutboxMessageCountAsync());
    }

    [Fact]
    public async Task PlaceBid_WhenScheduledOrClosed_DoesNotCreateOutboxMessage()
    {
        var scheduled = await _client.PostAsJsonAsync($"/api/auctions/{TestAuctionData.ScheduledAuctionId}/bids", new PlaceBidRequest("dana", 500m), JsonOptions);
        var closed = await _client.PostAsJsonAsync($"/api/auctions/{TestAuctionData.ClosedAuctionId}/bids", new PlaceBidRequest("dana", 500m), JsonOptions);

        Assert.Equal(HttpStatusCode.Conflict, scheduled.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, closed.StatusCode);
        Assert.Equal(0, await GetOutboxMessageCountAsync());
    }

    [Fact]
    public async Task ConcurrentSameAmount_CreatesOneBidAcceptedOutboxMessage()
    {
        var responses = await Task.WhenAll(
            PlaceBidAsync("alice-2", 1250m),
            PlaceBidAsync("bob-2", 1250m));
        var accepted = responses.Count(r => r.StatusCode == HttpStatusCode.Created);
        var messages = await GetOutboxMessagesAsync();

        Assert.Equal(1, accepted);
        var message = Assert.Single(messages);
        Assert.Equal(IntegrationEventTypes.BidAccepted, message.EventType);
        Assert.Equal(TestAuctionData.OpenAuctionId, message.AggregateId);
        Assert.Equal(4, message.AggregateVersion);
        Assert.Null(message.PublishedAtUtc);
    }

    [Fact]
    public async Task ConcurrentFailedAttempt_DoesNotLeaveOrphanOutboxMessage()
    {
        var responses = await Task.WhenAll(
            PlaceBidAsync("alice-2", 1250m),
            PlaceBidAsync("bob-2", 1250m));
        var accepted = responses.Count(r => r.StatusCode == HttpStatusCode.Created);
        var bids = await GetOpenAuctionBidsAsync();
        var messages = await GetOutboxMessagesAsync();

        Assert.Equal(1, accepted);
        Assert.Equal(3, bids.Count);
        Assert.Single(messages);
        Assert.Equal(bids.Count - 2, messages.Count);
    }

    [Fact]
    public async Task ManyConcurrentBidders_CreatesOneOutboxMessagePerAcceptedBid()
    {
        var requests = new[]
        {
            ("bidder-01", 1250m),
            ("bidder-02", 1250m),
            ("bidder-03", 1300m),
            ("bidder-04", 1350m),
            ("bidder-05", 1300m),
            ("bidder-06", 1400m),
            ("bidder-07", 1450m),
            ("bidder-08", 1500m),
            ("bidder-09", 1400m),
            ("bidder-10", 1500m)
        };

        var responses = await Task.WhenAll(requests.Select(r => PlaceBidAsync(r.Item1, r.Item2)));
        var accepted = responses.Count(r => r.StatusCode == HttpStatusCode.Created);
        var auction = await GetOpenAuctionAsync();
        var bids = await GetOpenAuctionBidsAsync();
        var messages = await GetOutboxMessagesAsync();

        Assert.Equal(accepted, messages.Count);
        Assert.Equal(2 + accepted, bids.Count);
        Assert.All(messages, message =>
        {
            Assert.Equal(IntegrationEventTypes.BidAccepted, message.EventType);
            Assert.Equal(TestAuctionData.OpenAuctionId, message.AggregateId);
            Assert.Null(message.PublishedAtUtc);
        });
        Assert.Equal(auction.Version, messages.Max(m => m.AggregateVersion));
    }
    [Fact]
    public async Task ConcurrentValidBids_SerializeSafely_AndFinalStateUsesHighestAcceptedBid()
    {
        var aliceTask = PlaceBidAsync("alice-2", 1250m);
        await Task.Delay(20);
        var bobTask = PlaceBidAsync("bob-2", 1300m);

        var responses = await Task.WhenAll(aliceTask, bobTask);
        var accepted = responses.Count(r => r.StatusCode == HttpStatusCode.Created);
        var auction = await GetOpenAuctionAsync();
        var bids = await GetOpenAuctionBidsAsync();

        Assert.True(accepted is 1 or 2);
        Assert.Equal(1300m, auction.CurrentBidAmount);
        Assert.Equal("bob-2", auction.CurrentBidderId);
        Assert.Equal(3 + accepted, auction.Version);
        Assert.Equal(2 + accepted, bids.Count);
        Assert.Equal(accepted, bids.Count(b => b.Amount is 1250m or 1300m));
    }

    [Fact]
    public async Task ConcurrentSameAmount_AllowsOnlyOneAcceptedBid()
    {
        var responses = await Task.WhenAll(
            PlaceBidAsync("alice-2", 1250m),
            PlaceBidAsync("bob-2", 1250m));

        var accepted = responses.Where(r => r.StatusCode == HttpStatusCode.Created).ToList();
        var rejected = responses.Where(r => r.StatusCode == HttpStatusCode.BadRequest).ToList();
        var auction = await GetOpenAuctionAsync();
        var bids = await GetOpenAuctionBidsAsync();

        Assert.Single(accepted);
        Assert.Single(rejected);
        Assert.Equal(1250m, auction.CurrentBidAmount);
        Assert.Equal(4, auction.Version);
        Assert.Equal(3, bids.Count);
        Assert.Single(bids, b => b.Amount == 1250m);
    }

    [Fact]
    public async Task ConcurrentLowerBidThatLosesRace_IsRejectedAfterRevalidation()
    {
        var highBidTask = PlaceBidAsync("alice-2", 1300m);
        await Task.Delay(20);
        var lowerBidTask = PlaceBidAsync("bob-2", 1250m);

        var responses = await Task.WhenAll(highBidTask, lowerBidTask);
        var accepted = responses.Where(r => r.StatusCode == HttpStatusCode.Created).ToList();
        var rejected = responses.Where(r => r.StatusCode == HttpStatusCode.BadRequest).ToList();
        var auction = await GetOpenAuctionAsync();
        var bids = await GetOpenAuctionBidsAsync();

        Assert.Single(accepted);
        Assert.Single(rejected);
        Assert.Equal(1300m, auction.CurrentBidAmount);
        Assert.Equal("alice-2", auction.CurrentBidderId);
        Assert.Equal(4, auction.Version);
        Assert.Equal(3, bids.Count);
        Assert.DoesNotContain(bids, b => b.BidderId == "bob-2");
    }

    [Fact]
    public async Task ManyConcurrentBidders_KeepBidHistoryAndVersionConsistent()
    {
        var requests = new[]
        {
            ("bidder-01", 1250m),
            ("bidder-02", 1250m),
            ("bidder-03", 1300m),
            ("bidder-04", 1350m),
            ("bidder-05", 1300m),
            ("bidder-06", 1400m),
            ("bidder-07", 1450m),
            ("bidder-08", 1500m),
            ("bidder-09", 1400m),
            ("bidder-10", 1500m)
        };

        var responses = await Task.WhenAll(requests.Select(r => PlaceBidAsync(r.Item1, r.Item2)));
        var accepted = responses.Count(r => r.StatusCode == HttpStatusCode.Created);
        var auction = await GetOpenAuctionAsync();
        var bids = await GetOpenAuctionBidsAsync();
        var acceptedDemoBids = bids.Where(b => b.BidderId.StartsWith("bidder-", StringComparison.Ordinal)).ToList();

        Assert.NotEmpty(acceptedDemoBids);
        Assert.Equal(acceptedDemoBids.Max(b => b.Amount), auction.CurrentBidAmount);
        Assert.Equal(3 + accepted, auction.Version);
        Assert.Equal(2 + accepted, bids.Count);
        Assert.Equal(accepted, acceptedDemoBids.Count);
        Assert.All(acceptedDemoBids, b => Assert.True(b.Amount >= 1250m));
        Assert.True(accepted is >= 1 and <= 6);
    }

    [Fact]
    public async Task FailedConcurrentAttempt_DoesNotLeavePartialBidRows()
    {
        var responses = await Task.WhenAll(
            PlaceBidAsync("alice-2", 1250m),
            PlaceBidAsync("bob-2", 1250m));

        Assert.Single(responses, r => r.StatusCode == HttpStatusCode.Created);
        Assert.Single(responses, r => r.StatusCode == HttpStatusCode.BadRequest);

        var bids = await GetOpenAuctionBidsAsync();
        Assert.Equal(3, bids.Count);
        Assert.Single(bids, b => b.Amount == 1250m);
        Assert.Equal(1, bids.Count(b => (b.BidderId == "alice-2" || b.BidderId == "bob-2") && b.Amount == 1250m));
    }

    private async Task<List<OutboxMessage>> GetOutboxMessagesAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BiddingDbContext>();
        return await db.OutboxMessages.AsNoTracking().OrderBy(m => m.CreatedAtUtc).ToListAsync();
    }

    private async Task<int> GetOutboxMessageCountAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BiddingDbContext>();
        return await db.OutboxMessages.CountAsync();
    }

    private Task<HttpResponseMessage> PlaceBidAsync(string bidderId, decimal amount)
    {
        return PlaceBidAsync(bidderId, amount, correlationId: null);
    }

    private Task<HttpResponseMessage> PlaceBidAsync(string bidderId, decimal amount, string? correlationId)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, $"/api/auctions/{TestAuctionData.OpenAuctionId}/bids")
        {
            Content = JsonContent.Create(new PlaceBidRequest(bidderId, amount), options: JsonOptions)
        };

        if (!string.IsNullOrWhiteSpace(correlationId))
        {
            request.Headers.TryAddWithoutValidation("X-Correlation-ID", correlationId);
        }

        return _client.SendAsync(request);
    }

    private async Task<AuctionDetailResponse> GetOpenAuctionAsync()
    {
        var auction = await _client.GetFromJsonAsync<AuctionDetailResponse>($"/api/auctions/{TestAuctionData.OpenAuctionId}", JsonOptions);
        Assert.NotNull(auction);
        return auction;
    }

    private async Task<List<BidResponse>> GetOpenAuctionBidsAsync()
    {
        var bids = await _client.GetFromJsonAsync<List<BidResponse>>($"/api/auctions/{TestAuctionData.OpenAuctionId}/bids", JsonOptions);
        Assert.NotNull(bids);
        return bids;
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
                ["Database:SeedDemoData"] = "false",
                ["BidPlacement:MaxConcurrencyRetries"] = "2",
                ["BidPlacement:ArtificialProcessingDelayMilliseconds"] = "75"
            });
        });

        builder.ConfigureServices(services =>
        {
            services.AddLogging(logging =>
            {
                logging.ClearProviders();
                logging.AddConsole();
            });
            services.RemoveAll<TimeProvider>();
            services.AddSingleton<TimeProvider>(_timeProvider);
        });
    }

    public async Task ResetDatabaseAsync()
    {
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BiddingDbContext>();
        await db.Database.ExecuteSqlRawAsync("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
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





