using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using bidding_service.Contracts;
using bidding_service.Data;
using bidding_service.Domain;
using bidding_service.Services;
using DistributedBidding.IntegrationContracts;
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
        Assert.Equal("AuctionOnly", auction.SaleMode);
        Assert.Null(auction.BuyNowPrice);
        Assert.Null(auction.FinalWinnerId);
        Assert.Null(auction.FinalPrice);
        Assert.Equal(1250m, auction.MinimumValidBid);
    }

    [Fact]
    public async Task BuyNowFields_PersistWithExistingMoneyPrecision()
    {
        var auctionId = Guid.NewGuid();
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BiddingDbContext>();
        db.Auctions.Add(new Auction
        {
            Id = auctionId,
            Title = "Buy Now test auction",
            Description = "Buy Now persistence foundation test.",
            StartingPrice = 1250m,
            SaleMode = SaleMode.BuyNowOnly,
            BuyNowPrice = 1250.67m,
            MinimumBidIncrement = 50m,
            StartTimeUtc = TestAuctionData.Now.AddHours(-1),
            EndTimeUtc = TestAuctionData.Now.AddHours(1),
            Status = AuctionStatus.Open,
            Version = 1,
            CreatedAtUtc = TestAuctionData.Now,
            UpdatedAtUtc = TestAuctionData.Now
        });

        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();

        var persisted = await db.Auctions.SingleAsync(auction => auction.Id == auctionId);
        Assert.Equal(SaleMode.BuyNowOnly, persisted.SaleMode);
        Assert.Equal(1250.67m, persisted.BuyNowPrice);
        Assert.Null(persisted.CurrentBidAmount);
        Assert.Null(persisted.CurrentBidderId);
        Assert.Null(persisted.FinalWinnerId);
        Assert.Null(persisted.FinalPrice);
    }

    [Fact]
    public async Task AuctionAndBuyNowWithNonIncreasingStartingPrice_IsRejected()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BiddingDbContext>();
        db.Auctions.Add(new Auction
        {
            Id = Guid.NewGuid(),
            Title = "Invalid Buy Now auction",
            Description = "Invalid sale-mode combination.",
            StartingPrice = 1000m,
            SaleMode = SaleMode.AuctionAndBuyNow,
            BuyNowPrice = 1000m,
            MinimumBidIncrement = 50m,
            StartTimeUtc = TestAuctionData.Now,
            EndTimeUtc = TestAuctionData.Now.AddHours(1),
            Status = AuctionStatus.Scheduled,
            Version = 1,
            CreatedAtUtc = TestAuctionData.Now,
            UpdatedAtUtc = TestAuctionData.Now
        });

        await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
    }

    [Theory]
    [InlineData(SaleMode.BuyNowOnly)]
    [InlineData(SaleMode.AuctionAndBuyNow)]
    public async Task BuyNow_WhenEligible_CommitsTerminalStateAndSiblingEvents(SaleMode saleMode)
    {
        var auctionId = await AddBuyNowAuctionAsync(saleMode);

        var response = await BuyNowAsync(auctionId, "buyer-123", "buy-now-correlation");

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var purchase = await response.Content.ReadFromJsonAsync<BuyNowResponse>(JsonOptions);
        Assert.NotNull(purchase);
        Assert.Equal(auctionId, purchase.AuctionId);
        Assert.Equal("buyer-123", purchase.BidderId);
        Assert.Equal(1500m, purchase.FinalPrice);
        Assert.Equal(2, purchase.AuctionVersion);
        Assert.Equal("buy-now-correlation", purchase.CorrelationId);
        Assert.Equal("buy-now-correlation", response.Headers.GetValues("X-Correlation-ID").Single());

        var auction = await GetAuctionAsync(auctionId);
        Assert.Equal("Closed", auction.Status);
        Assert.Equal("buyer-123", auction.FinalWinnerId);
        Assert.Equal(1500m, auction.FinalPrice);
        Assert.Equal(2, auction.Version);
        Assert.Null(auction.CurrentBidAmount);
        Assert.Null(auction.CurrentBidderId);
        Assert.Empty(await GetBidsAsync(auctionId));

        var messages = await GetOutboxMessagesAsync(auctionId);
        Assert.Equal(2, messages.Count);
        Assert.Equal(IntegrationEventTypes.AuctionPurchased, messages[0].EventType);
        Assert.Equal(IntegrationEventTypes.AuctionClosed, messages[1].EventType);
        Assert.All(messages, message =>
        {
            Assert.Equal(2, message.AggregateVersion);
            Assert.Equal("buy-now-correlation", message.CorrelationId);
        });
        Assert.NotEqual(messages[0].Id, messages[1].Id);
        Assert.DoesNotContain(messages, message => message.EventType == IntegrationEventTypes.WinnerSelected);

        var purchasedPayload = JsonSerializer.Deserialize<AuctionPurchasedPayload>(messages[0].Payload, JsonOptions);
        Assert.NotNull(purchasedPayload);
        Assert.Equal(auctionId, purchasedPayload.AuctionId);
        Assert.Equal("buyer-123", purchasedPayload.BidderId);
        Assert.Equal(1500m, purchasedPayload.FinalPrice);
        Assert.Equal(2, purchasedPayload.AuctionVersion);
    }

    [Fact]
    public async Task BuyNow_OnAuctionOnly_IsRejectedWithoutChangingState()
    {
        var response = await BuyNowAsync(TestAuctionData.OpenAuctionId, "buyer-123");

        await AssertBuyNowRejectedAsync(response, "buy_now_not_available");
        var auction = await GetAuctionAsync(TestAuctionData.OpenAuctionId);
        Assert.Equal("Open", auction.Status);
        Assert.Equal(3, auction.Version);
        Assert.Null(auction.FinalWinnerId);
        Assert.Null(auction.FinalPrice);
        Assert.Empty(await GetOutboxMessagesAsync(TestAuctionData.OpenAuctionId));
    }

    [Fact]
    public async Task BuyNow_InvalidOrUnavailableRequestsUseSpecificErrors()
    {
        var invalidBidder = await BuyNowAsync(TestAuctionData.OpenAuctionId, " ");
        var missingAuction = await BuyNowAsync(Guid.NewGuid(), "buyer-123");
        var scheduled = await BuyNowAsync(TestAuctionData.ScheduledAuctionId, "buyer-123");
        var beforeStart = await AddBuyNowAuctionAsync(
            SaleMode.BuyNowOnly,
            startTimeUtc: TestAuctionData.Now.AddMinutes(1));
        var ended = await AddBuyNowAuctionAsync(
            SaleMode.BuyNowOnly,
            endTimeUtc: TestAuctionData.Now);
        var closed = await AddBuyNowAuctionAsync(
            SaleMode.BuyNowOnly,
            status: AuctionStatus.Closed);

        Assert.Equal(HttpStatusCode.BadRequest, invalidBidder.StatusCode);
        Assert.Equal("invalid_bidder", (await invalidBidder.Content.ReadFromJsonAsync<ApiErrorResponse>(JsonOptions))?.Code);
        Assert.Equal(HttpStatusCode.NotFound, missingAuction.StatusCode);
        Assert.Equal("auction_not_found", (await missingAuction.Content.ReadFromJsonAsync<ApiErrorResponse>(JsonOptions))?.Code);
        await AssertBuyNowRejectedAsync(scheduled, "auction_not_open");
        await AssertBuyNowRejectedAsync(await BuyNowAsync(beforeStart, "buyer-123"), "auction_not_started");
        await AssertBuyNowRejectedAsync(await BuyNowAsync(ended, "buyer-123"), "auction_ended");
        await AssertBuyNowRejectedAsync(await BuyNowAsync(closed, "buyer-123"), "auction_not_open");
    }

    [Fact]
    public async Task BuyNowOnly_RejectsOrdinaryBids()
    {
        var auctionId = await AddBuyNowAuctionAsync(SaleMode.BuyNowOnly);

        var response = await PlaceBidAsync(auctionId, "bidder-123", 1100m);

        await AssertBidRejectedAsync(response, "bidding_not_available");
        var auction = await GetAuctionAsync(auctionId);
        Assert.Equal(1, auction.Version);
        Assert.Empty(await GetBidsAsync(auctionId));
        Assert.Empty(await GetOutboxMessagesAsync(auctionId));
    }

    [Fact]
    public async Task AuctionAndBuyNow_AcceptsBelowPriceAndRejectsAtOrAbovePrice()
    {
        var auctionId = await AddBuyNowAuctionAsync(SaleMode.AuctionAndBuyNow);

        var accepted = await PlaceBidAsync(auctionId, "bidder-123", 1250m);
        var equal = await PlaceBidAsync(auctionId, "bidder-456", 1500m);
        var above = await PlaceBidAsync(auctionId, "bidder-789", 1501m);

        Assert.Equal(HttpStatusCode.Created, accepted.StatusCode);
        await AssertBidRejectedAsync(equal, "bid_at_or_above_buy_now_price", HttpStatusCode.BadRequest);
        await AssertBidRejectedAsync(above, "bid_at_or_above_buy_now_price", HttpStatusCode.BadRequest);

        var auction = await GetAuctionAsync(auctionId);
        Assert.Equal(1250m, auction.CurrentBidAmount);
        Assert.Equal("bidder-123", auction.CurrentBidderId);
        Assert.Equal(2, auction.Version);
        Assert.Single(await GetBidsAsync(auctionId));
        Assert.Single(await GetOutboxMessagesAsync(auctionId));
    }

    [Fact]
    public async Task AuctionAndBuyNow_WhenNextMinimumReachesPrice_RemainsValidWithoutLegalNextBid()
    {
        var auctionId = await AddBuyNowAuctionAsync(
            SaleMode.AuctionAndBuyNow,
            startingPrice: 100m,
            minimumBidIncrement: 100m,
            buyNowPrice: 500m,
            currentBidAmount: 450m,
            currentBidderId: "existing-bidder",
            version: 2);

        var response = await PlaceBidAsync(auctionId, "bidder-123", 550m);

        await AssertBidRejectedAsync(response, "bid_at_or_above_buy_now_price", HttpStatusCode.BadRequest);
        var auction = await GetAuctionAsync(auctionId);
        Assert.Equal("Open", auction.Status);
        Assert.Equal(2, auction.Version);
        Assert.Equal(450m, auction.CurrentBidAmount);
        Assert.Empty(await GetOutboxMessagesAsync(auctionId));
    }

    [Fact]
    public async Task ConcurrentBuyNowRequestsCommitOnePurchaseAndReturnSpecificLoserError()
    {
        var auctionId = await AddBuyNowAuctionAsync(SaleMode.BuyNowOnly);

        var responses = await Task.WhenAll(
            BuyNowAsync(auctionId, "buyer-1"),
            BuyNowAsync(auctionId, "buyer-2"));

        Assert.Single(responses, response => response.StatusCode == HttpStatusCode.Created);
        var rejected = Assert.Single(responses, response => response.StatusCode == HttpStatusCode.Conflict);
        var rejectedError = await rejected.Content.ReadFromJsonAsync<ApiErrorResponse>(JsonOptions);
        Assert.True(rejectedError?.Code is "auction_not_open" or "buy_now_not_available");

        var auction = await GetAuctionAsync(auctionId);
        Assert.Equal("Closed", auction.Status);
        Assert.Equal(2, auction.Version);
        Assert.NotNull(auction.FinalWinnerId);
        Assert.Equal(1500m, auction.FinalPrice);
        var messages = await GetOutboxMessagesAsync(auctionId);
        Assert.Equal(2, messages.Count);
        Assert.Single(messages, message => message.EventType == IntegrationEventTypes.AuctionPurchased);
    }

    [Fact]
    public async Task DuplicateBuyNowSubmissionDoesNotCreateDuplicatePurchase()
    {
        var auctionId = await AddBuyNowAuctionAsync(SaleMode.BuyNowOnly);

        var first = await BuyNowAsync(auctionId, "buyer-1");
        var second = await BuyNowAsync(auctionId, "buyer-1");

        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        await AssertBuyNowRejectedAsync(second, "auction_not_open");

        var auction = await GetAuctionAsync(auctionId);
        Assert.Equal("Closed", auction.Status);
        Assert.Equal(2, auction.Version);
        Assert.Equal("buyer-1", auction.FinalWinnerId);
        Assert.Equal(1500m, auction.FinalPrice);

        var messages = await GetOutboxMessagesAsync(auctionId);
        Assert.Equal(2, messages.Count);
        Assert.Single(messages, message => message.EventType == IntegrationEventTypes.AuctionPurchased);
        Assert.Single(messages, message => message.EventType == IntegrationEventTypes.AuctionClosed);
    }

    [Fact]
    public async Task BuyNowAndBidRejectAtExactEndTimeBoundary()
    {
        var auctionId = await AddBuyNowAuctionAsync(
            SaleMode.AuctionAndBuyNow,
            endTimeUtc: TestAuctionData.Now);

        await AssertBuyNowRejectedAsync(await BuyNowAsync(auctionId, "buyer-1"), "auction_ended");
        await AssertBidRejectedAsync(
            await PlaceBidAsync(auctionId, "bidder-1", 1250m),
            "auction_ended");

        var auction = await GetAuctionAsync(auctionId);
        Assert.Equal("Open", auction.Status);
        Assert.Equal(1, auction.Version);
        Assert.Null(auction.FinalWinnerId);
        Assert.Null(auction.FinalPrice);
        Assert.Empty(await GetBidsAsync(auctionId));
        Assert.Empty(await GetOutboxMessagesAsync(auctionId));
    }

    [Fact]
    public async Task BuyNowAndOrdinaryBidRaceLeavesOnePurchaseAndConsistentTerminalState()
    {
        var auctionId = await AddBuyNowAuctionAsync(SaleMode.AuctionAndBuyNow);

        var responses = await Task.WhenAll(
            BuyNowAsync(auctionId, "buyer-1"),
            PlaceBidAsync(auctionId, "bidder-1", 1250m));

        var acceptedBid = responses[1].StatusCode == HttpStatusCode.Created ? 1 : 0;
        var auction = await GetAuctionAsync(auctionId);
        var bids = await GetBidsAsync(auctionId);
        var messages = await GetOutboxMessagesAsync(auctionId);

        Assert.Equal("Closed", auction.Status);
        Assert.Equal(2 + acceptedBid, auction.Version);
        Assert.NotNull(auction.FinalWinnerId);
        Assert.Equal(1500m, auction.FinalPrice);
        Assert.Equal(acceptedBid, bids.Count);
        Assert.Equal(acceptedBid + 2, messages.Count);
        Assert.Single(messages, message => message.EventType == IntegrationEventTypes.AuctionPurchased);
        Assert.Single(messages, message => message.EventType == IntegrationEventTypes.AuctionClosed);
        Assert.DoesNotContain(messages, message => message.EventType == IntegrationEventTypes.WinnerSelected);
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
        return await GetOutboxMessagesAsync(null);
    }

    private async Task<List<OutboxMessage>> GetOutboxMessagesAsync(Guid? auctionId)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BiddingDbContext>();
        var query = db.OutboxMessages.AsNoTracking();
        if (auctionId.HasValue)
        {
            query = query.Where(message => message.AggregateId == auctionId.Value);
        }

        return await query.OrderBy(m => m.CreatedAtUtc).ThenBy(m => m.Id).ToListAsync();
    }

    private async Task<int> GetOutboxMessageCountAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BiddingDbContext>();
        return await db.OutboxMessages.CountAsync();
    }

    private Task<HttpResponseMessage> PlaceBidAsync(string bidderId, decimal amount)
    {
        return PlaceBidAsync(TestAuctionData.OpenAuctionId, bidderId, amount, correlationId: null);
    }

    private Task<HttpResponseMessage> PlaceBidAsync(string bidderId, decimal amount, string? correlationId)
    {
        return PlaceBidAsync(TestAuctionData.OpenAuctionId, bidderId, amount, correlationId);
    }

    private Task<HttpResponseMessage> PlaceBidAsync(Guid auctionId, string bidderId, decimal amount)
    {
        return PlaceBidAsync(auctionId, bidderId, amount, correlationId: null);
    }

    private Task<HttpResponseMessage> PlaceBidAsync(
        Guid auctionId,
        string bidderId,
        decimal amount,
        string? correlationId)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, $"/api/auctions/{auctionId}/bids")
        {
            Content = JsonContent.Create(new PlaceBidRequest(bidderId, amount), options: JsonOptions)
        };

        if (!string.IsNullOrWhiteSpace(correlationId))
        {
            request.Headers.TryAddWithoutValidation("X-Correlation-ID", correlationId);
        }

        return _client.SendAsync(request);
    }

    private Task<HttpResponseMessage> BuyNowAsync(Guid auctionId, string bidderId, string? correlationId = null)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, $"/api/auctions/{auctionId}/buy-now")
        {
            Content = JsonContent.Create(new BuyNowRequest(bidderId), options: JsonOptions)
        };

        if (!string.IsNullOrWhiteSpace(correlationId))
        {
            request.Headers.TryAddWithoutValidation("X-Correlation-ID", correlationId);
        }

        return _client.SendAsync(request);
    }

    private async Task<AuctionDetailResponse> GetOpenAuctionAsync()
    {
        return await GetAuctionAsync(TestAuctionData.OpenAuctionId);
    }

    private async Task<AuctionDetailResponse> GetAuctionAsync(Guid auctionId)
    {
        var auction = await _client.GetFromJsonAsync<AuctionDetailResponse>($"/api/auctions/{auctionId}", JsonOptions);
        Assert.NotNull(auction);
        return auction;
    }

    private async Task<List<BidResponse>> GetOpenAuctionBidsAsync()
    {
        return await GetBidsAsync(TestAuctionData.OpenAuctionId);
    }

    private async Task<List<BidResponse>> GetBidsAsync(Guid auctionId)
    {
        var bids = await _client.GetFromJsonAsync<List<BidResponse>>($"/api/auctions/{auctionId}/bids", JsonOptions);
        Assert.NotNull(bids);
        return bids;
    }

    private async Task<Guid> AddBuyNowAuctionAsync(
        SaleMode saleMode,
        decimal startingPrice = 1000m,
        decimal minimumBidIncrement = 50m,
        decimal buyNowPrice = 1500m,
        decimal? currentBidAmount = null,
        string? currentBidderId = null,
        long version = 1,
        AuctionStatus status = AuctionStatus.Open,
        DateTimeOffset? startTimeUtc = null,
        DateTimeOffset? endTimeUtc = null)
    {
        var auctionId = Guid.NewGuid();
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BiddingDbContext>();
        db.Auctions.Add(new Auction
        {
            Id = auctionId,
            Title = "BN2 API test auction",
            Description = "BN2 Buy Now integration test.",
            StartingPrice = startingPrice,
            SaleMode = saleMode,
            BuyNowPrice = buyNowPrice,
            MinimumBidIncrement = minimumBidIncrement,
            CurrentBidAmount = currentBidAmount,
            CurrentBidderId = currentBidderId,
            StartTimeUtc = startTimeUtc ?? TestAuctionData.Now.AddHours(-1),
            EndTimeUtc = endTimeUtc ?? TestAuctionData.Now.AddHours(1),
            Status = status,
            Version = version,
            CreatedAtUtc = TestAuctionData.Now.AddDays(-1),
            UpdatedAtUtc = TestAuctionData.Now
        });
        await db.SaveChangesAsync();
        return auctionId;
    }

    private async Task AssertBuyNowRejectedAsync(
        HttpResponseMessage response,
        string expectedCode,
        HttpStatusCode expectedStatus = HttpStatusCode.Conflict)
    {
        Assert.Equal(expectedStatus, response.StatusCode);
        var error = await response.Content.ReadFromJsonAsync<ApiErrorResponse>(JsonOptions);
        Assert.Equal(expectedCode, error?.Code);
    }

    private async Task AssertBidRejectedAsync(
        HttpResponseMessage response,
        string expectedCode,
        HttpStatusCode expectedStatus = HttpStatusCode.Conflict)
    {
        Assert.Equal(expectedStatus, response.StatusCode);
        var error = await response.Content.ReadFromJsonAsync<ApiErrorResponse>(JsonOptions);
        Assert.Equal(expectedCode, error?.Code);
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
                SaleMode = SaleMode.AuctionOnly,
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
                SaleMode = SaleMode.AuctionOnly,
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
                SaleMode = SaleMode.AuctionOnly,
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
                SaleMode = SaleMode.AuctionOnly,
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
                SaleMode = SaleMode.AuctionOnly,
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





