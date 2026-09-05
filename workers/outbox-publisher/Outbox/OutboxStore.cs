using Npgsql;
using NpgsqlTypes;

namespace outbox_publisher.Outbox;

public sealed class OutboxStore(NpgsqlDataSource dataSource, TimeProvider timeProvider, ILogger<OutboxStore> logger)
{
    public async Task<ClaimedOutboxBatch> ClaimBatchAsync(int batchSize, int maxPublishAttempts, CancellationToken cancellationToken)
    {
        var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        var transaction = await connection.BeginTransactionAsync(cancellationToken);

        try
        {
            await using var command = new NpgsqlCommand(
                """
                SELECT id, event_type, aggregate_type, aggregate_id, aggregate_version, occurred_at_utc,
                       correlation_id, payload::text, created_at_utc, publish_attempts
                FROM outbox_messages
                WHERE published_at_utc IS NULL
                  AND publish_attempts < @maxPublishAttempts
                ORDER BY created_at_utc, id
                LIMIT @batchSize
                FOR UPDATE SKIP LOCKED;
                """,
                connection,
                transaction);
            command.Parameters.AddWithValue("batchSize", batchSize);
            command.Parameters.AddWithValue("maxPublishAttempts", maxPublishAttempts);

            var messages = new List<OutboxMessage>();
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                messages.Add(new OutboxMessage(
                    reader.GetGuid(0),
                    reader.GetString(1),
                    reader.GetString(2),
                    reader.GetGuid(3),
                    reader.GetInt64(4),
                    reader.GetFieldValue<DateTimeOffset>(5),
                    reader.IsDBNull(6) ? null : reader.GetString(6),
                    reader.GetString(7),
                    reader.GetFieldValue<DateTimeOffset>(8),
                    reader.GetInt32(9)));
            }

            logger.LogInformation("Claimed {MessageCount} outbox messages", messages.Count);
            return new ClaimedOutboxBatch(connection, transaction, messages);
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            await transaction.DisposeAsync();
            await connection.DisposeAsync();
            throw;
        }
    }

    public async Task MarkPublishedAsync(ClaimedOutboxBatch batch, OutboxMessage message, CancellationToken cancellationToken)
    {
        await using var command = new NpgsqlCommand(
            """
            UPDATE outbox_messages
            SET published_at_utc = @publishedAtUtc,
                last_error = NULL
            WHERE id = @id;
            """,
            batch.Connection,
            batch.Transaction);
        command.Parameters.AddWithValue("publishedAtUtc", timeProvider.GetUtcNow());
        command.Parameters.AddWithValue("id", message.Id);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task MarkPublishFailedAsync(ClaimedOutboxBatch batch, OutboxMessage message, Exception exception, CancellationToken cancellationToken)
    {
        var conciseError = exception.Message.Length > 500 ? exception.Message[..500] : exception.Message;
        await using var command = new NpgsqlCommand(
            """
            UPDATE outbox_messages
            SET publish_attempts = publish_attempts + 1,
                last_error = @lastError
            WHERE id = @id;
            """,
            batch.Connection,
            batch.Transaction);
        command.Parameters.AddWithValue("lastError", NpgsqlDbType.Text, conciseError);
        command.Parameters.AddWithValue("id", message.Id);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }
}

public sealed class ClaimedOutboxBatch(NpgsqlConnection connection, NpgsqlTransaction transaction, IReadOnlyList<OutboxMessage> messages) : IAsyncDisposable
{
    public NpgsqlConnection Connection { get; } = connection;
    public NpgsqlTransaction Transaction { get; } = transaction;
    public IReadOnlyList<OutboxMessage> Messages { get; } = messages;

    public Task CommitAsync(CancellationToken cancellationToken) => Transaction.CommitAsync(cancellationToken);

    public async ValueTask DisposeAsync()
    {
        await Transaction.DisposeAsync();
        await Connection.DisposeAsync();
    }
}
