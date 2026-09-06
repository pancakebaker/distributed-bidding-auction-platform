using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Npgsql;
using outbox_publisher.Options;
using outbox_publisher.Outbox;
using outbox_publisher.RabbitMq;
using RabbitMQ.Client;

[assembly: CollectionBehavior(DisableTestParallelization = true)]

namespace outbox_publisher.Tests;

public sealed class OutboxPublisherIntegrationTests : IAsyncLifetime
{
    private const string DatabaseName = "auction_demo_publisher_tests";
    private const string ConnectionString = "Host=127.0.0.1;Port=55432;Database=auction_demo_publisher_tests;Username=auction_app;Password=change_me_in_local_env";
    private const string MaintenanceConnectionString = "Host=127.0.0.1;Port=55432;Database=postgres;Username=auction_app;Password=change_me_in_local_env";
    private const string ExchangeName = "auction.events";
    private const string DebugQueue = "auction.events.debug";
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly RabbitMqOptions _rabbitOptions = new()
    {
        HostName = "localhost",
        Port = 5672,
        UserName = "auction",
        Password = "change_me_in_local_env",
        Exchange = ExchangeName,
        DebugQueue = DebugQueue,
        DeclareDebugQueue = true
    };

    public async Task InitializeAsync()
    {
        await ResetDatabaseAsync();
        await ResetRabbitMqAsync();
    }

    public Task DisposeAsync() => Task.CompletedTask;

    [Fact]
    public async Task UnpublishedOutboxMessage_IsPublished_AndMarkedPublishedAfterConfirmation()
    {
        var messageId = await InsertOutboxMessageAsync(correlationId: "phase4-correlation-1", aggregateVersion: 42);
        var service = CreatePublishingService(_rabbitOptions);

        var published = await service.PublishOnceAsync(CancellationToken.None);
        var dbRow = await GetOutboxRowAsync(messageId);
        var brokerMessage = await BasicGetAsync();

        Assert.Equal(1, published);
        Assert.NotNull(dbRow.PublishedAtUtc);
        Assert.Equal(0, dbRow.PublishAttempts);
        Assert.Null(dbRow.LastError);
        Assert.NotNull(brokerMessage);
        Assert.Equal(messageId.ToString(), brokerMessage!.Properties.MessageId);
        Assert.Equal("phase4-correlation-1", brokerMessage!.Properties.CorrelationId);
        Assert.Equal("BidAccepted", brokerMessage!.Properties.Type);
        Assert.True(brokerMessage!.Properties.Persistent);
    }

    [Fact]
    public async Task PublishedMessages_AreNotRepublishedDuringNormalPolling()
    {
        await InsertOutboxMessageAsync(correlationId: "phase4-no-republish", aggregateVersion: 43);
        var service = CreatePublishingService(_rabbitOptions);

        Assert.Equal(1, await service.PublishOnceAsync(CancellationToken.None));
        await PurgeDebugQueueAsync();

        Assert.Equal(0, await service.PublishOnceAsync(CancellationToken.None));
        Assert.Null(await BasicGetAsync());
    }

    [Fact]
    public async Task RabbitMqUnavailable_LeavesMessageUnpublished_AndRecordsFailure()
    {
        var messageId = await InsertOutboxMessageAsync(correlationId: "phase4-rabbit-down", aggregateVersion: 44);
        var badRabbitOptions = RabbitOptions(port: 5673);
        var service = CreatePublishingService(badRabbitOptions);

        var published = await service.PublishOnceAsync(CancellationToken.None);
        var dbRow = await GetOutboxRowAsync(messageId);

        Assert.Equal(0, published);
        Assert.Null(dbRow.PublishedAtUtc);
        Assert.Equal(1, dbRow.PublishAttempts);
        Assert.False(string.IsNullOrWhiteSpace(dbRow.LastError));
    }

    [Fact]
    public async Task RabbitMqRecovery_PublishesPreviouslyFailedMessage()
    {
        var messageId = await InsertOutboxMessageAsync(correlationId: "phase4-recovery", aggregateVersion: 45);
        var failedService = CreatePublishingService(RabbitOptions(port: 5673));
        var recoveredService = CreatePublishingService(_rabbitOptions);

        Assert.Equal(0, await failedService.PublishOnceAsync(CancellationToken.None));
        Assert.Equal(1, await recoveredService.PublishOnceAsync(CancellationToken.None));

        var dbRow = await GetOutboxRowAsync(messageId);
        var brokerMessage = await BasicGetAsync();
        Assert.NotNull(dbRow.PublishedAtUtc);
        Assert.Equal(1, dbRow.PublishAttempts);
        Assert.Null(dbRow.LastError);
        Assert.NotNull(brokerMessage);
    }

    [Fact]
    public async Task EventBody_PreservesEnvelopePayloadVersionCorrelationAndEventId()
    {
        var messageId = await InsertOutboxMessageAsync(correlationId: "phase4-envelope", aggregateVersion: 46);
        var service = CreatePublishingService(_rabbitOptions);

        await service.PublishOnceAsync(CancellationToken.None);
        var brokerMessage = await BasicGetAsync();

        Assert.NotNull(brokerMessage);
        using var document = JsonDocument.Parse(brokerMessage!.Body);
        var root = document.RootElement;
        Assert.Equal(messageId, root.GetProperty("eventId").GetGuid());
        Assert.Equal("BidAccepted", root.GetProperty("eventType").GetString());
        Assert.Equal("Auction", root.GetProperty("aggregateType").GetString());
        Assert.Equal(46, root.GetProperty("aggregateVersion").GetInt64());
        Assert.Equal("phase4-envelope", root.GetProperty("correlationId").GetString());
        Assert.Equal("phase4-bidder", root.GetProperty("payload").GetProperty("bidderId").GetString());
        Assert.Equal(46, root.GetProperty("payload").GetProperty("auctionVersion").GetInt64());
    }

    [Fact]
    public async Task MultipleMessages_PublishInCreatedOrder()
    {
        var first = await InsertOutboxMessageAsync(correlationId: "phase4-order-1", aggregateVersion: 47, createdOffsetSeconds: -2);
        var second = await InsertOutboxMessageAsync(correlationId: "phase4-order-2", aggregateVersion: 48, createdOffsetSeconds: -1);
        var service = CreatePublishingService(_rabbitOptions);

        Assert.Equal(2, await service.PublishOnceAsync(CancellationToken.None));
        var firstBrokerMessage = await BasicGetAsync();
        var secondBrokerMessage = await BasicGetAsync();

        Assert.NotNull(firstBrokerMessage);
        Assert.NotNull(secondBrokerMessage);
        Assert.Equal(first.ToString(), firstBrokerMessage!.Properties.MessageId);
        Assert.Equal(second.ToString(), secondBrokerMessage!.Properties.MessageId);
    }

    [Fact]
    public async Task CompetingPublishers_DoNotClaimSameRows()
    {
        var first = await InsertOutboxMessageAsync(correlationId: "phase4-claim-1", aggregateVersion: 49, createdOffsetSeconds: -2);
        var second = await InsertOutboxMessageAsync(correlationId: "phase4-claim-2", aggregateVersion: 50, createdOffsetSeconds: -1);
        await using var dataSource = NpgsqlDataSource.Create(ConnectionString);
        var store = new OutboxStore(dataSource, TimeProvider.System, NullLogger<OutboxStore>.Instance);

        await using var firstBatch = await store.ClaimBatchAsync(1, 10, CancellationToken.None);
        await using var secondBatch = await store.ClaimBatchAsync(10, 10, CancellationToken.None);

        Assert.Equal(first, Assert.Single(firstBatch.Messages).Id);
        Assert.Equal(second, Assert.Single(secondBatch.Messages).Id);
    }


    private RabbitMqOptions RabbitOptions(int port = 5672)
    {
        return new RabbitMqOptions
        {
            HostName = _rabbitOptions.HostName,
            Port = port,
            UserName = _rabbitOptions.UserName,
            Password = _rabbitOptions.Password,
            VirtualHost = _rabbitOptions.VirtualHost,
            Exchange = _rabbitOptions.Exchange,
            DebugQueue = _rabbitOptions.DebugQueue,
            DeclareDebugQueue = _rabbitOptions.DeclareDebugQueue
        };
    }
    private OutboxPublishingService CreatePublishingService(RabbitMqOptions rabbitOptions)
    {
        var dataSource = NpgsqlDataSource.Create(ConnectionString);
        var store = new OutboxStore(dataSource, TimeProvider.System, NullLogger<OutboxStore>.Instance);
        var publisher = new RabbitMqEventPublisher(Microsoft.Extensions.Options.Options.Create(rabbitOptions), NullLogger<RabbitMqEventPublisher>.Instance);
        return new OutboxPublishingService(
            store,
            publisher,
            Microsoft.Extensions.Options.Options.Create(new PublisherOptions { BatchSize = 20, MaxPublishAttempts = 10, PollIntervalSeconds = 1 }),
            NullLogger<OutboxPublishingService>.Instance);
    }

    private static async Task ResetDatabaseAsync()
    {
        await EnsureTestDatabaseExistsAsync();

        await using var dataSource = NpgsqlDataSource.Create(ConnectionString);
        await using var connection = await dataSource.OpenConnectionAsync(CancellationToken.None);
        await using var command = new NpgsqlCommand(
            """
            CREATE TABLE IF NOT EXISTS outbox_messages (
                id uuid PRIMARY KEY,
                event_type character varying(120) NOT NULL,
                aggregate_type character varying(120) NOT NULL,
                aggregate_id uuid NOT NULL,
                aggregate_version bigint NOT NULL,
                occurred_at_utc timestamp with time zone NOT NULL,
                correlation_id character varying(120),
                payload jsonb NOT NULL,
                created_at_utc timestamp with time zone NOT NULL,
                published_at_utc timestamp with time zone,
                publish_attempts integer NOT NULL DEFAULT 0,
                last_error character varying(2000)
            );
            CREATE INDEX IF NOT EXISTS ix_outbox_messages_published_at_created_at ON outbox_messages (published_at_utc, created_at_utc);
            CREATE INDEX IF NOT EXISTS ix_outbox_messages_aggregate_id_version ON outbox_messages (aggregate_id, aggregate_version);
            TRUNCATE TABLE outbox_messages;
            """,
            connection);
        await command.ExecuteNonQueryAsync(CancellationToken.None);
    }


    private static async Task EnsureTestDatabaseExistsAsync()
    {
        await using var dataSource = NpgsqlDataSource.Create(MaintenanceConnectionString);
        await using var connection = await dataSource.OpenConnectionAsync(CancellationToken.None);
        await using var existsCommand = new NpgsqlCommand("select 1 from pg_database where datname = @databaseName", connection);
        existsCommand.Parameters.AddWithValue("databaseName", DatabaseName);
        var exists = await existsCommand.ExecuteScalarAsync(CancellationToken.None);
        if (exists is not null)
        {
            return;
        }

        await using var createCommand = new NpgsqlCommand($"CREATE DATABASE {DatabaseName}", connection);
        await createCommand.ExecuteNonQueryAsync(CancellationToken.None);
    }
    private async Task ResetRabbitMqAsync()
    {
        var publisher = new RabbitMqEventPublisher(Microsoft.Extensions.Options.Options.Create(_rabbitOptions), NullLogger<RabbitMqEventPublisher>.Instance);
        await publisher.DeclareTopologyAsync(CancellationToken.None);
        await PurgeDebugQueueAsync();
    }

    private static async Task<Guid> InsertOutboxMessageAsync(string correlationId, long aggregateVersion, int createdOffsetSeconds = 0)
    {
        var id = Guid.NewGuid();
        var auctionId = Guid.Parse("11111111-1111-1111-1111-111111111111");
        var bidId = Guid.NewGuid();
        var occurredAt = DateTimeOffset.UtcNow.AddSeconds(createdOffsetSeconds);
        var payload = JsonSerializer.Serialize(new
        {
            bidId,
            auctionId,
            bidderId = "phase4-bidder",
            amount = 10500m,
            occurredAtUtc = occurredAt,
            auctionVersion = aggregateVersion
        }, JsonOptions);

        await using var dataSource = NpgsqlDataSource.Create(ConnectionString);
        await using var connection = await dataSource.OpenConnectionAsync(CancellationToken.None);
        await using var command = new NpgsqlCommand(
            """
            INSERT INTO outbox_messages
                (id, event_type, aggregate_type, aggregate_id, aggregate_version, occurred_at_utc, correlation_id, payload, created_at_utc, publish_attempts)
            VALUES
                (@id, 'BidAccepted', 'Auction', @aggregateId, @aggregateVersion, @occurredAtUtc, @correlationId, @payload::jsonb, @createdAtUtc, 0);
            """,
            connection);
        command.Parameters.AddWithValue("id", id);
        command.Parameters.AddWithValue("aggregateId", auctionId);
        command.Parameters.AddWithValue("aggregateVersion", aggregateVersion);
        command.Parameters.AddWithValue("occurredAtUtc", occurredAt);
        command.Parameters.AddWithValue("correlationId", correlationId);
        command.Parameters.AddWithValue("payload", payload);
        command.Parameters.AddWithValue("createdAtUtc", occurredAt);
        await command.ExecuteNonQueryAsync(CancellationToken.None);
        return id;
    }

    private static async Task<OutboxRow> GetOutboxRowAsync(Guid id)
    {
        await using var dataSource = NpgsqlDataSource.Create(ConnectionString);
        await using var connection = await dataSource.OpenConnectionAsync(CancellationToken.None);
        await using var command = new NpgsqlCommand("select published_at_utc, publish_attempts, last_error from outbox_messages where id = @id", connection);
        command.Parameters.AddWithValue("id", id);
        await using var reader = await command.ExecuteReaderAsync(CancellationToken.None);
        Assert.True(await reader.ReadAsync(CancellationToken.None));
        return new OutboxRow(
            reader.IsDBNull(0) ? null : reader.GetFieldValue<DateTimeOffset>(0),
            reader.GetInt32(1),
            reader.IsDBNull(2) ? null : reader.GetString(2));
    }

    private async Task PurgeDebugQueueAsync()
    {
        await using var connection = await CreateRabbitConnectionAsync();
        await using var channel = await connection.CreateChannelAsync(cancellationToken: CancellationToken.None);
        await channel.QueuePurgeAsync(DebugQueue, CancellationToken.None);
    }

    private async Task<BrokerMessage?> BasicGetAsync()
    {
        await using var connection = await CreateRabbitConnectionAsync();
        await using var channel = await connection.CreateChannelAsync(cancellationToken: CancellationToken.None);
        var result = await channel.BasicGetAsync(DebugQueue, autoAck: true, cancellationToken: CancellationToken.None);
        if (result is null)
        {
            return null;
        }

        return new BrokerMessage(Encoding.UTF8.GetString(result.Body.ToArray()), result.BasicProperties);
    }

    private async Task<IConnection> CreateRabbitConnectionAsync()
    {
        var factory = new ConnectionFactory
        {
            HostName = _rabbitOptions.HostName,
            Port = _rabbitOptions.Port,
            UserName = _rabbitOptions.UserName,
            Password = _rabbitOptions.Password,
            VirtualHost = _rabbitOptions.VirtualHost
        };
        return await factory.CreateConnectionAsync(CancellationToken.None);
    }

    private sealed record OutboxRow(DateTimeOffset? PublishedAtUtc, int PublishAttempts, string? LastError);
    private sealed record BrokerMessage(string Body, IReadOnlyBasicProperties Properties);
}




