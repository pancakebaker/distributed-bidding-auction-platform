import amqp from "amqplib";
import type { Channel, ChannelModel, ConsumeMessage } from "amqplib";
import type { LiveFeedConfig } from "./config.js";
import type { LiveFeedEventProcessor } from "./processor.js";

export class LiveFeedRabbitMqConsumer {
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;
  private stopped = false;
  private reconnectTimer: NodeJS.Timeout | null = null;

  public connected = false;

  public constructor(
    private readonly config: LiveFeedConfig,
    private readonly processor: LiveFeedEventProcessor
  ) {}

  public async start(): Promise<void> {
    this.stopped = false;
    await this.connect();
  }

  public async stop(): Promise<void> {
    this.stopped = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.connected = false;

    await this.channel?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);

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

      connection.on("close", () => {
        this.connected = false;
        this.channel = null;
        this.connection = null;

        if (!this.stopped) {
          console.warn("RabbitMQ connection closed; reconnecting.");
          this.scheduleReconnect();
        }
      });

      connection.on("error", (error) => {
        console.warn("RabbitMQ connection error.", { message: error.message });
      });

      await this.configureTopology(channel);
      await channel.prefetch(this.config.rabbitMqPrefetch);

      await channel.consume(
        this.config.rabbitMqQueue,
        (message) => {
          void this.handleMessage(channel, message);
        },
        { noAck: false }
      );

      console.info("Live Feed RabbitMQ consumer started.", {
        exchange: this.config.rabbitMqExchange,
        queue: this.config.rabbitMqQueue,
        routingKeys: this.config.rabbitMqRoutingKeys,
        prefetch: this.config.rabbitMqPrefetch
      });
    } catch (error) {
      this.connected = false;
      const message = error instanceof Error ? error.message : "RabbitMQ connection failed.";
      console.warn("RabbitMQ is unavailable for live feed consumer.", { message });
      this.scheduleReconnect();
    }
  }

  private async configureTopology(channel: Channel): Promise<void> {
    await channel.assertExchange(this.config.rabbitMqExchange, "topic", { durable: true });
    await channel.assertExchange(this.config.rabbitMqDeadLetterExchange, "direct", { durable: true });
    await channel.assertQueue(this.config.rabbitMqDeadLetterQueue, { durable: true });
    await channel.bindQueue(
      this.config.rabbitMqDeadLetterQueue,
      this.config.rabbitMqDeadLetterExchange,
      this.config.rabbitMqDeadLetterQueue
    );

    await channel.assertQueue(this.config.rabbitMqQueue, {
      durable: true,
      arguments: {
        "x-dead-letter-exchange": this.config.rabbitMqDeadLetterExchange,
        "x-dead-letter-routing-key": this.config.rabbitMqDeadLetterQueue
      }
    });

    for (const routingKey of this.config.rabbitMqRoutingKeys) {
      await channel.bindQueue(this.config.rabbitMqQueue, this.config.rabbitMqExchange, routingKey);
    }
  }

  private async handleMessage(channel: Channel, message: ConsumeMessage | null): Promise<void> {
    if (!message) {
      return;
    }

    try {
      const result = await this.processor.process(message.content);

      if (result.action === "invalid") {
        channel.nack(message, false, false);
        return;
      }

      channel.ack(message);
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "Live-feed processing failed.";
      console.warn("Transient live-feed processing failure; message will be requeued.", { message: messageText });
      channel.nack(message, false, true);
    }
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