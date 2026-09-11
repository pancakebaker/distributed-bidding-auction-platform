/**
 * RabbitMQ consumer topology and manual acknowledgement handling for live-feed events.
 */
import amqp from 'amqplib';
import type { Channel, ChannelModel, ConsumeMessage } from 'amqplib';
import type { LiveFeedConfig } from '../../config/config.js';
import type { LiveFeedProcessor } from '../../application/ports/live-feed-processor.js';
import { parseLiveFeedEnvelope } from '../../domain/events.js';
import type { AsyncContext } from '../runtime/async-context.js';
import { runWithContext } from '../runtime/async-context.js';

/**
 * Owns the live-feed RabbitMQ queue, bindings, reconnect loop, and ACK/NACK behavior.
 */
export class LiveFeedRabbitMqConsumer {
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;
  private stopped = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private consumerTag: string | null = null;
  private readonly inFlight = new Set<Promise<void>>();
  private stopPromise: Promise<void> | null = null;

  /**
   * Indicates whether the consumer currently has an open RabbitMQ channel.
   */
  public connected = false;

  public constructor(
    private readonly config: LiveFeedConfig,
    private readonly processor: LiveFeedProcessor,
  ) {}

  /**
   * Starts the consumer and declares the live-feed queue topology.
   */
  public async start(): Promise<void> {
    this.stopped = false;
    await this.connect();
  }

  /**
   * Stops reconnect attempts and closes the RabbitMQ channel and connection.
   */
  public async stop(): Promise<void> {
    if (!this.stopPromise) {
      this.stopPromise = this.stopInternal();
    }

    await this.stopPromise;
  }

  private async stopInternal(): Promise<void> {
    this.stopped = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.connected = false;

    const channel = this.channel;
    const connection = this.connection;
    if (channel && this.consumerTag) {
      await channel.cancel(this.consumerTag).catch(() => undefined);
      this.consumerTag = null;
    }

    await Promise.allSettled([...this.inFlight]);
    await channel?.close().catch(() => undefined);
    await connection?.close().catch(() => undefined);

    this.channel = null;
    this.connection = null;
  }
  private async connect(): Promise<void> {
    try {
      const connection = await amqp.connect(this.config.rabbitMqUrl);
      const channel = await connection.createChannel();

      this.connection = connection;
      this.channel = channel;
      this.connected = true;

      connection.on('close', () => {
        this.connected = false;
        this.channel = null;
        this.connection = null;

        if (!this.stopped) {
          console.warn('RabbitMQ connection closed; reconnecting.');
          this.scheduleReconnect();
        }
      });

      connection.on('error', (error: Error) => {
        console.warn('RabbitMQ connection error.', { message: error.message });
      });

      await this.configureTopology(channel);
      await channel.prefetch(this.config.rabbitMqPrefetch);

      const consumer = await channel.consume(
        this.config.rabbitMqQueue,
        (message) => {
          const handling = this.handleMessage(channel, message);
          this.inFlight.add(handling);
          void handling.finally(() => this.inFlight.delete(handling)).catch(() => undefined);
        },
        { noAck: false },
      );
      this.consumerTag = consumer.consumerTag;

      console.info('Live Feed RabbitMQ consumer started.', {
        exchange: this.config.rabbitMqExchange,
        queue: this.config.rabbitMqQueue,
        routingKeys: this.config.rabbitMqRoutingKeys,
        prefetch: this.config.rabbitMqPrefetch,
      });
    } catch (error) {
      this.connected = false;
      const message = error instanceof Error ? error.message : 'RabbitMQ connection failed.';
      console.warn('RabbitMQ is unavailable for live feed consumer.', { message });
      this.scheduleReconnect();
    }
  }

  private async configureTopology(channel: Channel): Promise<void> {
    await channel.assertExchange(this.config.rabbitMqExchange, 'topic', { durable: true });
    await channel.assertExchange(this.config.rabbitMqDeadLetterExchange, 'direct', {
      durable: true,
    });
    await channel.assertQueue(this.config.rabbitMqDeadLetterQueue, { durable: true });
    await channel.bindQueue(
      this.config.rabbitMqDeadLetterQueue,
      this.config.rabbitMqDeadLetterExchange,
      this.config.rabbitMqDeadLetterQueue,
    );

    await channel.assertQueue(this.config.rabbitMqQueue, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': this.config.rabbitMqDeadLetterExchange,
        'x-dead-letter-routing-key': this.config.rabbitMqDeadLetterQueue,
      },
    });

    for (const routingKey of this.config.rabbitMqRoutingKeys) {
      await channel.bindQueue(this.config.rabbitMqQueue, this.config.rabbitMqExchange, routingKey);
    }
  }

  private async handleMessage(channel: Channel, message: ConsumeMessage | null): Promise<void> {
    if (!message) {
      return;
    }

    await runWithContext(contextFromMessage(message.content), async () => {
      let envelope;

      try {
        envelope = parseLiveFeedEnvelope(message.content);
      } catch (error) {
        const messageText = error instanceof Error ? error.message : 'Invalid event envelope.';
        console.warn('Dropping invalid live-feed message.', { reason: messageText });
        channel.nack(message, false, false);
        return;
      }

      try {
        await this.processor.process(envelope);
        channel.ack(message);
      } catch (error) {
        const messageText = error instanceof Error ? error.message : 'Live-feed processing failed.';
        console.warn('Transient live-feed processing failure; message will be requeued.', {
          message: messageText,
        });
        channel.nack(message, false, true);
      }
    });
  }
  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) {
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, 2000);
  }
}

function contextFromMessage(body: Buffer): AsyncContext {
  try {
    const envelope = parseLiveFeedEnvelope(body);
    return {
      correlationId: envelope.correlationId ?? undefined,
      eventId: envelope.eventId,
      auctionId: envelope.payload.auctionId,
    };
  } catch {
    return {};
  }
}
