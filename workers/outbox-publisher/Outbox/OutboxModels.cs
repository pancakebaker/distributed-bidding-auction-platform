using System.Text.Json;
using System.Text.Json.Nodes;

namespace outbox_publisher.Outbox;

public sealed record OutboxMessage(
    Guid Id,
    string EventType,
    string AggregateType,
    Guid AggregateId,
    long AggregateVersion,
    DateTimeOffset OccurredAtUtc,
    string? CorrelationId,
    string Payload,
    DateTimeOffset CreatedAtUtc,
    int PublishAttempts);

public sealed record IntegrationEventEnvelope(
    Guid EventId,
    string EventType,
    DateTimeOffset OccurredAtUtc,
    string AggregateType,
    Guid AggregateId,
    long AggregateVersion,
    string? CorrelationId,
    JsonNode? Payload)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public static IntegrationEventEnvelope FromOutboxMessage(OutboxMessage message)
    {
        return new IntegrationEventEnvelope(
            message.Id,
            message.EventType,
            message.OccurredAtUtc,
            message.AggregateType,
            message.AggregateId,
            message.AggregateVersion,
            message.CorrelationId,
            JsonNode.Parse(message.Payload));
    }

    public string ToJson() => JsonSerializer.Serialize(this, JsonOptions);
}
