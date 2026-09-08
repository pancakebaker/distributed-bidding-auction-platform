/**
 * Socket.IO adapter that publishes application live-feed updates to auction rooms.
 */
import type { Server } from 'socket.io';
import { auctionRoom } from './rooms.js';
import type { LiveFeedPublisher, LiveFeedUpdate } from '../../application/ports/live-feed-publisher.js';

/**
 * Publishes existing live-feed event names and payloads through Socket.IO.
 */
export class SocketIoLiveFeedPublisher implements LiveFeedPublisher {
  public constructor(private readonly io: Server) {}

  /**
   * Emits an update to the existing auction-specific Socket.IO room.
   */
  public publish(update: LiveFeedUpdate): void {
    this.io.to(auctionRoom(update.auctionId)).emit(update.eventName, update.payload);
  }
}
