// <copyright file="ActivityPersistence.cs" company="Distributed Bidding Auction Platform">
// Copyright (c) Distributed Bidding Auction Platform. Licensed under the MIT license.
// </copyright>
using System.Text.Json;
using AuctionOperationsPortal.Contracts;
using AuctionOperationsPortal.Data;
using AuctionOperationsPortal.Telemetry;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace AuctionOperationsPortal.Persistence;

/// <summary>Persists accepted integration events as operational activity records.</summary>
public interface IActivityPersistence
{
    /// <summary>Persists an event and reports whether it was inserted or already present.</summary>
    Task<ActivityPersistenceResult> PersistAsync(IntegrationEventEnvelope envelope, CancellationToken cancellationToken);
}

/// <summary>Describes the result of attempting to persist an activity event.</summary>
public sealed record ActivityPersistenceResult(bool Inserted, AuctionActivity? Activity);

/// <summary>Stores integration events while treating duplicate event identifiers as idempotent.</summary>
public sealed class ActivityPersistence(AuctionOperationsDbContext db, TimeProvider timeProvider) : IActivityPersistence
{
    /// <summary>Persists an integration event in a transaction.</summary>
    public async Task<ActivityPersistenceResult> PersistAsync(IntegrationEventEnvelope envelope, CancellationToken cancellationToken)
    {
        using var activitySpan = PortalTelemetry.StartActivity("portal.activity.persist");
        PortalTelemetry.AddEventTags(activitySpan, envelope.EventId, envelope.EventType, envelope.AggregateId, envelope.AggregateVersion, envelope.CorrelationId);
        var activity = IntegrationEventMapper.ToActivity(envelope, timeProvider.GetUtcNow());
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        db.AuctionActivities.Add(activity);
        try
        {
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            activitySpan?.SetTag("persistence.outcome", "inserted");
            return new ActivityPersistenceResult(true, activity);
        }
        catch (DbUpdateException exception) when (exception.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation } postgres && postgres.ConstraintName == "ux_auction_activity_event_id")
        {
            await transaction.RollbackAsync(cancellationToken);
            db.Entry(activity).State = EntityState.Detached;
            activitySpan?.SetTag("persistence.outcome", "duplicate");
            return new ActivityPersistenceResult(false, null);
        }
    }
}

/// <summary>Maps validated integration event envelopes to portal activity records.</summary>
public sealed class IntegrationEventMapper
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    /// <summary>Converts a supported event envelope into an activity record.</summary>
    public static AuctionActivity ToActivity(IntegrationEventEnvelope envelope, DateTimeOffset processedAtUtc)
    {
        if (envelope.EventId == Guid.Empty || string.IsNullOrWhiteSpace(envelope.EventType) || string.IsNullOrWhiteSpace(envelope.AggregateType) || envelope.AggregateId == Guid.Empty || envelope.AggregateVersion < 1)
            throw new FormatException("The event envelope is invalid.");

        var activity = new AuctionActivity
        {
            EventId = envelope.EventId,
            EventType = envelope.EventType,
            AggregateType = envelope.AggregateType,
            AggregateId = envelope.AggregateId,
            AggregateVersion = envelope.AggregateVersion,
            CorrelationId = envelope.CorrelationId,
            OccurredAtUtc = envelope.OccurredAtUtc,
            ProcessedAtUtc = processedAtUtc
        };

        switch (envelope.EventType)
        {
            case "BidAccepted":
                var bid = Deserialize<BidAcceptedPayload>(envelope.Payload);
                ValidateAuction(bid.AuctionId, bid.AuctionVersion, envelope);
                activity.BidId = bid.BidId;
                activity.BidderId = bid.BidderId;
                activity.Amount = bid.Amount;
                break;
            case "AuctionClosed":
                var closed = Deserialize<AuctionClosedPayload>(envelope.Payload);
                ValidateAuction(closed.AuctionId, closed.AuctionVersion, envelope);
                activity.BidderId = closed.FinalBidderId;
                activity.Amount = closed.FinalBidAmount;
                break;
            case "WinnerSelected":
                var winner = Deserialize<WinnerSelectedPayload>(envelope.Payload);
                ValidateAuction(winner.AuctionId, winner.AuctionVersion, envelope);
                activity.BidId = winner.WinningBidId;
                activity.BidderId = winner.WinnerId;
                activity.WinnerId = winner.WinnerId;
                activity.Amount = winner.Amount;
                break;
            default:
                throw new FormatException($"Unsupported event type '{envelope.EventType}'.");
        }

        return activity;
    }

    private static T Deserialize<T>(JsonElement payload) => JsonSerializer.Deserialize<T>(payload.GetRawText(), JsonOptions) ?? throw new FormatException("Event payload is missing.");

    private static void ValidateAuction(Guid auctionId, long auctionVersion, IntegrationEventEnvelope envelope)
    {
        if (auctionId == Guid.Empty || auctionId != envelope.AggregateId || auctionVersion != envelope.AggregateVersion)
            throw new FormatException("Event payload does not match its envelope.");
    }
}
