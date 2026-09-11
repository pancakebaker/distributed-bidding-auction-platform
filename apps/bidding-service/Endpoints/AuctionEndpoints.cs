// <copyright file="AuctionEndpoints.cs" company="Distributed Bidding Auction Platform">
// Copyright (c) Distributed Bidding Auction Platform. Licensed under the MIT license.
// </copyright>
using bidding_service.Contracts;
using bidding_service.Data;
using bidding_service.Domain;
using bidding_service.Services;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace bidding_service.Endpoints;

/// <summary>
/// Maps auction discovery, detail, history, and bid placement endpoints.
/// </summary>
public static class AuctionEndpoints
{
    private const string CorrelationIdHeader = "X-Correlation-ID";

    /// <summary>
    /// Registers auction and bid endpoints on the web application.
    /// </summary>
    public static RouteGroupBuilder MapAuctionEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/auctions").WithTags("Auctions");

        group.MapGet("/", GetAuctions)
            .WithName("GetAuctions")
            .Produces<IReadOnlyList<AuctionSummaryResponse>>();

        group.MapGet("/{id:guid}", GetAuction)
            .WithName("GetAuction")
            .Produces<AuctionDetailResponse>()
            .Produces<ApiErrorResponse>(StatusCodes.Status404NotFound);

        group.MapGet("/{id:guid}/bids", GetBids)
            .WithName("GetAuctionBids")
            .Produces<IReadOnlyList<BidResponse>>()
            .Produces<ApiErrorResponse>(StatusCodes.Status404NotFound);

        group.MapPost("/{id:guid}/bids", PlaceBid)
            .WithName("PlaceBid")
            .Produces<PlaceBidResponse>(StatusCodes.Status201Created)
            .Produces<ApiErrorResponse>(StatusCodes.Status400BadRequest)
            .Produces<ApiErrorResponse>(StatusCodes.Status404NotFound)
            .Produces<ApiErrorResponse>(StatusCodes.Status409Conflict);

        return group;
    }

    private static async Task<Ok<List<AuctionSummaryResponse>>> GetAuctions(
        BiddingDbContext db,
        CancellationToken cancellationToken)
    {
        var auctions = await db.Auctions
            .AsNoTracking()
            .OrderBy(a => a.StartTimeUtc)
            .Select(a => new AuctionSummaryResponse(
                a.Id,
                a.Title,
                a.StartingPrice,
                a.MinimumBidIncrement,
                a.CurrentBidAmount,
                a.CurrentBidderId,
                a.CurrentBidAmount == null ? a.StartingPrice : a.CurrentBidAmount.Value + a.MinimumBidIncrement,
                a.Status.ToString(),
                a.StartTimeUtc,
                a.EndTimeUtc,
                a.Version))
            .ToListAsync(cancellationToken);

        return TypedResults.Ok(auctions);
    }

    private static async Task<
        Results<Ok<AuctionDetailResponse>, NotFound<ApiErrorResponse>>>
        GetAuction(
        Guid id,
        BiddingDbContext db,
        CancellationToken cancellationToken)
    {
        var auction = await db.Auctions
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == id, cancellationToken);
        if (auction is null)
        {
            return TypedResults.NotFound(
                new ApiErrorResponse("auction_not_found", "Auction not found."));
        }

        return TypedResults.Ok(ToDetailResponse(auction));
    }

    private static async Task<Results<Ok<List<BidResponse>>, NotFound<ApiErrorResponse>>> GetBids(
        Guid id,
        BiddingDbContext db,
        CancellationToken cancellationToken)
    {
        var auctionExists = await db.Auctions.AnyAsync(a => a.Id == id, cancellationToken);
        if (!auctionExists)
        {
            return TypedResults.NotFound(
                new ApiErrorResponse("auction_not_found", "Auction not found."));
        }

        var bids = await db.Bids
            .AsNoTracking()
            .Where(b => b.AuctionId == id)
            .OrderByDescending(b => b.CreatedAtUtc)
            .Select(b => new BidResponse(b.Id, b.AuctionId, b.BidderId, b.Amount, b.CreatedAtUtc))
            .ToListAsync(cancellationToken);

        return TypedResults.Ok(bids);
    }

    private static async Task<
        Results<
            Created<PlaceBidResponse>,
            BadRequest<ApiErrorResponse>,
            NotFound<ApiErrorResponse>,
            Conflict<ApiErrorResponse>>>
        PlaceBid(
        Guid id,
        PlaceBidRequest request,
        BiddingDbContext db,
        TimeProvider timeProvider,
        IOptions<BidPlacementOptions> options,
        ILoggerFactory loggerFactory,
        HttpContext httpContext,
        CancellationToken cancellationToken)
    {
        var logger = loggerFactory.CreateLogger("BidPlacement");
        var correlationId = ResolveCorrelationId(httpContext);
        httpContext.Response.Headers[CorrelationIdHeader] = correlationId;

        var bidderId = request.BidderId?.Trim();
        if (string.IsNullOrWhiteSpace(bidderId))
        {
            return TypedResults.BadRequest(
                new ApiErrorResponse("invalid_bidder", "BidderId is required."));
        }

        if (request.Amount <= 0)
        {
            return TypedResults.BadRequest(
                new ApiErrorResponse(
                    "invalid_bid_amount",
                    "Bid amount must be greater than zero."));
        }

        var maxRetries = Math.Max(0, options.Value.MaxConcurrencyRetries);
        for (var attempt = 0; attempt <= maxRetries; attempt++)
        {
            await using var transaction = await db.Database
                .BeginTransactionAsync(cancellationToken);
            var auction = await db.Auctions.FirstOrDefaultAsync(a => a.Id == id, cancellationToken);
            if (auction is null)
            {
                await transaction.RollbackAsync(cancellationToken);
                return TypedResults.NotFound(
                    new ApiErrorResponse("auction_not_found", "Auction not found."));
            }

            var now = timeProvider.GetUtcNow();
            var validationError = ValidateBid(auction, request.Amount, now);
            if (validationError is not null)
            {
                await transaction.RollbackAsync(cancellationToken);
                logger.LogInformation(
                    "Bid rejected after validation for auction {AuctionId}. Code: {Code}. Version: {AuctionVersion}. CorrelationId: {CorrelationId}",
                    auction.Id,
                    validationError.Error.Code,
                    auction.Version,
                    correlationId);

                return validationError.StatusCode == StatusCodes.Status409Conflict
                    ? TypedResults.Conflict(validationError.Error)
                    : TypedResults.BadRequest(validationError.Error);
            }

            if (options.Value.ArtificialProcessingDelayMilliseconds > 0)
            {
                await Task.Delay(
                    options.Value.ArtificialProcessingDelayMilliseconds,
                    cancellationToken);
            }

            var bid = new Bid
            {
                Id = Guid.NewGuid(),
                AuctionId = auction.Id,
                BidderId = bidderId,
                Amount = request.Amount,
                CreatedAtUtc = now
            };

            db.Bids.Add(bid);
            auction.CurrentBidAmount = request.Amount;
            auction.CurrentBidderId = bid.BidderId;
            auction.Version += 1;
            auction.UpdatedAtUtc = now;

            var outboxMessage = OutboxMessageFactory.BidAccepted(bid, auction, correlationId, now);
            db.OutboxMessages.Add(outboxMessage);

            try
            {
                await db.SaveChangesAsync(cancellationToken);
                await transaction.CommitAsync(cancellationToken);

                logger.LogInformation(
                    "Accepted bid for auction {AuctionId}. Version advanced to {AuctionVersion}. OutboxMessageId: {OutboxMessageId}. CorrelationId: {CorrelationId}",
                    auction.Id,
                    auction.Version,
                    outboxMessage.Id,
                    correlationId);

                var response = new PlaceBidResponse(
                    bid.Id,
                    auction.Id,
                    bid.BidderId,
                    bid.Amount,
                    auction.CurrentBidAmount.Value,
                    auction.CurrentBidderId!,
                    BidRules.GetMinimumValidBid(auction),
                    auction.Version,
                    bid.CreatedAtUtc,
                    correlationId);

                return TypedResults.Created($"/api/auctions/{auction.Id}/bids/{bid.Id}", response);
            }
            catch (DbUpdateConcurrencyException)
            {
                await transaction.RollbackAsync(cancellationToken);
                db.ChangeTracker.Clear();

                logger.LogWarning(
                    "Concurrency conflict detected for auction {AuctionId} on attempt {Attempt} of {MaxAttempts}. CorrelationId: {CorrelationId}",
                    id,
                    attempt + 1,
                    maxRetries + 1,
                    correlationId);

                if (attempt == maxRetries)
                {
                    var currentAuction = await db.Auctions
                        .AsNoTracking()
                        .FirstOrDefaultAsync(a => a.Id == id, cancellationToken);
                    return TypedResults.Conflict(new ApiErrorResponse(
                        "auction_concurrency_conflict",
                        "Auction state changed while the bid was being placed. Retry with the latest auction state.",
                        currentAuction is null ? null : ToBidRuleDetails(currentAuction)));
                }

                logger.LogInformation(
                    "Retrying bid placement for auction {AuctionId}. Next attempt: {Attempt}. CorrelationId: {CorrelationId}",
                    id,
                    attempt + 2,
                    correlationId);
            }
        }

        return TypedResults.Conflict(new ApiErrorResponse(
            "auction_concurrency_conflict",
            "Auction state changed while the bid was being placed. Retry with the latest auction state."));
    }

    private static BidValidationError? ValidateBid(
        Auction auction,
        decimal amount,
        DateTimeOffset now)
    {
        if (auction.Status != AuctionStatus.Open)
        {
            return new BidValidationError(
                StatusCodes.Status409Conflict,
                new ApiErrorResponse(
                    "auction_not_open",
                    "Auction is not open for bidding.",
                    ToBidRuleDetails(auction)));
        }

        if (now < auction.StartTimeUtc)
        {
            return new BidValidationError(
                StatusCodes.Status409Conflict,
                new ApiErrorResponse(
                    "auction_not_started",
                    "Auction has not started yet.",
                    ToBidRuleDetails(auction)));
        }

        if (now > auction.EndTimeUtc)
        {
            return new BidValidationError(
                StatusCodes.Status409Conflict,
                new ApiErrorResponse(
                    "auction_ended",
                    "Auction has already ended.",
                    ToBidRuleDetails(auction)));
        }

        var minimumValidBid = BidRules.GetMinimumValidBid(auction);
        if (amount < minimumValidBid)
        {
            return new BidValidationError(
                StatusCodes.Status400BadRequest,
                new ApiErrorResponse(
                    "bid_below_minimum",
                    "Bid amount does not satisfy the minimum bid.",
                    ToBidRuleDetails(auction)));
        }

        return null;
    }

    private static AuctionDetailResponse ToDetailResponse(Auction auction)
    {
        return new AuctionDetailResponse(
            auction.Id,
            auction.Title,
            auction.Description,
            auction.StartingPrice,
            auction.MinimumBidIncrement,
            auction.CurrentBidAmount,
            auction.CurrentBidderId,
            BidRules.GetMinimumValidBid(auction),
            auction.Status.ToString(),
            auction.StartTimeUtc,
            auction.EndTimeUtc,
            auction.CreatedAtUtc,
            auction.UpdatedAtUtc,
            auction.Version);
    }

    private static BidRuleErrorDetails ToBidRuleDetails(Auction auction)
    {
        return new BidRuleErrorDetails(
            auction.CurrentBidAmount,
            BidRules.GetMinimumValidBid(auction),
            auction.Version);
    }

    private static string ResolveCorrelationId(HttpContext httpContext)
    {
        var incoming = httpContext.Request.Headers[CorrelationIdHeader].FirstOrDefault();
        return string.IsNullOrWhiteSpace(incoming) ? Guid.NewGuid().ToString("N") : incoming.Trim();
    }

    private sealed record BidValidationError(int StatusCode, ApiErrorResponse Error);
}
