using System.Text.Json;
using AuctionOperationsPortal.Components;
using AuctionOperationsPortal.Contracts;
using AuctionOperationsPortal.Data;
using AuctionOperationsPortal.Notifications;
using AuctionOperationsPortal.Persistence;
using BenchmarkDotNet.Attributes;
using BenchmarkDotNet.Order;

namespace AuctionOperationsPortal.Benchmarks;

[MemoryDiagnoser]
[Orderer(SummaryOrderPolicy.FastestToSlowest)]
public class EventProcessingBenchmarks
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly byte[] bidAcceptedJson = JsonSerializer.SerializeToUtf8Bytes(CreateEnvelope("BidAccepted"), JsonOptions);
    private readonly byte[] auctionClosedJson = JsonSerializer.SerializeToUtf8Bytes(CreateEnvelope("AuctionClosed"), JsonOptions);
    private readonly byte[] winnerSelectedJson = JsonSerializer.SerializeToUtf8Bytes(CreateEnvelope("WinnerSelected"), JsonOptions);
    private readonly IntegrationEventEnvelope envelope = CreateEnvelope("BidAccepted");
    private readonly AuctionActivity activity = CreateActivity();

    [Benchmark]
    public IntegrationEventEnvelope DeserializeBidAccepted() => JsonSerializer.Deserialize<IntegrationEventEnvelope>(bidAcceptedJson, JsonOptions)!;

    [Benchmark]
    public IntegrationEventEnvelope DeserializeAuctionClosed() => JsonSerializer.Deserialize<IntegrationEventEnvelope>(auctionClosedJson, JsonOptions)!;

    [Benchmark]
    public IntegrationEventEnvelope DeserializeWinnerSelected() => JsonSerializer.Deserialize<IntegrationEventEnvelope>(winnerSelectedJson, JsonOptions)!;

    [Benchmark]
    public AuctionActivity MapEnvelopeToActivity() => IntegrationEventMapper.ToActivity(envelope, DateTimeOffset.UtcNow);

    [Benchmark]
    public ActivityNotification MapActivityToNotification() => ActivityNotification.From(activity);

    private static IntegrationEventEnvelope CreateEnvelope(string eventType)
    {
        var auctionId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
        var payload = eventType switch
        {
            "BidAccepted" => JsonSerializer.SerializeToElement(new BidAcceptedPayload(Guid.NewGuid(), auctionId, "bidder-001", 1250m, DateTimeOffset.UtcNow, 18), JsonOptions),
            "AuctionClosed" => JsonSerializer.SerializeToElement(new AuctionClosedPayload(auctionId, DateTimeOffset.UtcNow, 1250m, "bidder-001", 19), JsonOptions),
            _ => JsonSerializer.SerializeToElement(new WinnerSelectedPayload(auctionId, Guid.NewGuid(), "bidder-001", 1250m, DateTimeOffset.UtcNow, 19), JsonOptions)
        };
        return new IntegrationEventEnvelope(Guid.NewGuid(), eventType, DateTimeOffset.UtcNow, "Auction", auctionId, eventType == "BidAccepted" ? 18 : 19, "benchmark-correlation", payload);
    }

    private static AuctionActivity CreateActivity() => new()
    {
        Id = 1,
        EventId = Guid.NewGuid(),
        EventType = "BidAccepted",
        AggregateType = "Auction",
        AggregateId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
        AggregateVersion = 18,
        CorrelationId = "benchmark-correlation",
        OccurredAtUtc = DateTimeOffset.UtcNow,
        ProcessedAtUtc = DateTimeOffset.UtcNow,
        BidId = Guid.NewGuid(),
        BidderId = "bidder-001",
        Amount = 1250m
    };
}

[MemoryDiagnoser]
[Orderer(SummaryOrderPolicy.FastestToSlowest)]
public class LiveStateMergeBenchmarks
{
    private List<ActivityNotification> snapshot = null!;
    private List<ActivityNotification> duplicateHeavy = null!;
    private LiveActivityState state = null!;

    [Params(100)]
    public int EntryCount { get; set; }

    [GlobalSetup]
    public void Setup()
    {
        snapshot = CreateActivities(EntryCount, 0);
        duplicateHeavy = CreateActivities(EntryCount, EntryCount / 2);
        state = new LiveActivityState(100);
    }

    [Benchmark]
    public IReadOnlyList<ActivityNotification> MergeSnapshot()
    {
        state = new LiveActivityState(100);
        state.Merge(snapshot);
        return state.Items;
    }

    [Benchmark]
    public IReadOnlyList<ActivityNotification> MergeDuplicateHeavySnapshot()
    {
        state = new LiveActivityState(100);
        state.Merge(duplicateHeavy);
        return state.Items;
    }

    private static List<ActivityNotification> CreateActivities(int count, int duplicateOffset)
    {
        var auctionId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
        return Enumerable.Range(0, count)
            .Select(index => new ActivityNotification(
                index + 1,
                GuidFromInt(duplicateOffset > 0 ? index % duplicateOffset : index),
                index % 2 == 0 ? "AuctionClosed" : "WinnerSelected",
                auctionId,
                16,
                "benchmark-correlation",
                DateTimeOffset.UtcNow.AddSeconds(-index),
                DateTimeOffset.UtcNow,
                "bidder-001",
                1250m,
                "winner-001"))
            .ToList();
    }

    private static Guid GuidFromInt(int value) => new(value, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
}

[MemoryDiagnoser]
[Orderer(SummaryOrderPolicy.FastestToSlowest)]
public class ReportPreparationBenchmarks
{
    private List<ActivityNotification> rows = null!;

    [Params(100, 1_000, 5_000)]
    public int RowCount { get; set; }

    [GlobalSetup]
    public void Setup() => rows = Enumerable.Range(0, RowCount)
        .Select(index => new ActivityNotification(
            index + 1,
            Guid.NewGuid(),
            index % 3 == 0 ? "BidAccepted" : index % 3 == 1 ? "AuctionClosed" : "WinnerSelected",
            Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
            index + 1,
            "benchmark-correlation",
            DateTimeOffset.UtcNow.AddSeconds(-index),
            DateTimeOffset.UtcNow,
            "bidder-001",
            1250m,
            "winner-001"))
        .ToList();

    [Benchmark]
    public List<ReportRow> ProjectRowsForRenderer() => rows
        .OrderBy(row => row.OccurredAtUtc)
        .ThenBy(row => row.Id)
        .Select(row => new ReportRow(
            row.OccurredAtUtc.ToString("yyyy-MM-dd HH:mm:ss", System.Globalization.CultureInfo.InvariantCulture),
            row.EventType,
            row.AggregateId.ToString(),
            row.Amount?.ToString("0.00", System.Globalization.CultureInfo.InvariantCulture) ?? "—",
            $"v{row.AggregateVersion}",
            row.CorrelationId ?? "—"))
        .ToList();

    public sealed record ReportRow(string OccurredUtc, string EventType, string AggregateId, string Amount, string Version, string CorrelationId);
}
