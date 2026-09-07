import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type { Channel, ConsumeMessage } from 'amqplib';
import type {
  LiveFeedEventProcessor,
  ProcessResult,
} from '../../src/application/processors/live-feed-event-processor.js';
import { loadConfig } from '../../src/config/config.js';
import { LiveFeedRabbitMqConsumer } from '../../src/infrastructure/messaging/rabbitmq-consumer.js';
import { getContext, getContextValue } from '../../src/infrastructure/runtime/async-context.js';

type ConsumerInternals = {
  handleMessage: (channel: Channel, message: ConsumeMessage | null) => Promise<void>;
};

function messageFor(correlationId: string | null, auctionId: string): ConsumeMessage {
  const eventId = randomUUID();
  const body = Buffer.from(
    JSON.stringify({
      eventId,
      eventType: 'BidAccepted',
      occurredAtUtc: new Date().toISOString(),
      aggregateType: 'Auction',
      aggregateId: auctionId,
      aggregateVersion: 1,
      correlationId,
      payload: {
        bidId: randomUUID(),
        auctionId,
        bidderId: 'alice',
        amount: 100,
        auctionVersion: 1,
      },
    }),
  );

  return {
    content: body,
    fields: {},
    properties: {},
  } as ConsumeMessage;
}

void test('RabbitMQ deliveries receive isolated event context without changing ACK behavior', async () => {
  const observed: Array<{
    correlationId: string | undefined;
    eventId: string | undefined;
    auctionId: string | undefined;
  }> = [];
  const processor = {
    async process(body: Buffer): Promise<ProcessResult> {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      const context = getContext();
      observed.push({
        correlationId: context?.correlationId,
        eventId: context?.eventId,
        auctionId: context?.auctionId,
      });
      const parsed = JSON.parse(body.toString('utf8')) as {
        eventId: string;
        aggregateId: string;
        aggregateVersion: number;
      };
      return {
        action: 'broadcast',
        socketEvent: 'bid:accepted',
        eventId: parsed.eventId,
        aggregateId: parsed.aggregateId,
        aggregateVersion: parsed.aggregateVersion,
      };
    },
  } as unknown as LiveFeedEventProcessor;
  const consumer = new LiveFeedRabbitMqConsumer(loadConfig(), processor);
  const acknowledgements: ConsumeMessage[] = [];
  const channel = {
    ack: (message: ConsumeMessage) => acknowledgements.push(message),
    nack: () => assert.fail('unexpected NACK'),
  } as unknown as Channel;
  const first = messageFor('correlation-a', randomUUID());
  const second = messageFor(null, randomUUID());

  await Promise.all([
    (consumer as unknown as ConsumerInternals).handleMessage(channel, first),
    (consumer as unknown as ConsumerInternals).handleMessage(channel, second),
  ]);

  assert.equal(acknowledgements.length, 2);
  assert.deepEqual(observed.map((entry) => entry.correlationId).sort(), ['correlation-a', undefined]);
  assert.ok(observed.every((entry) => entry.eventId && entry.auctionId));
  assert.equal(getContext(), undefined);
  assert.equal(getContextValue('eventId'), undefined);
});
