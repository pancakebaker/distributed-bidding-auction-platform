/**
 * Socket.IO adapter for safe operational activity updates to authorized admin sockets.
 */
import type { Server } from 'socket.io';
import type { OperationalActivity } from '../../application/diagnostics/recent-activity-store.js';
import type { ActivityRecorder } from '../../application/ports/activity-recorder.js';

/** Socket.IO room reserved for authorized operational admin sockets. */
export const adminLiveFeedRoom = 'admin:live-feed';
/** Socket.IO event carrying safe operational activity metadata. */
export const adminActivityEvent = 'admin:activity';

/**
 * Publishes operational activity only to the separate admin room.
 */
export class SocketIoAdminLiveFeedPublisher {
  public constructor(private readonly io: Server) {}

  /**
   * Emits safe activity metadata without changing normal auction rooms or events.
   */
  public publish(activity: OperationalActivity): void {
    this.io.to(adminLiveFeedRoom).emit(adminActivityEvent, { ...activity });
  }
}

/**
 * Combines the bounded activity store and admin Socket.IO publisher.
 */
export class LiveFeedActivityObserver implements ActivityRecorder {
  public constructor(
    private readonly store: ActivityRecorder,
    private readonly publisher: SocketIoAdminLiveFeedPublisher,
  ) {}

  /**
   * Records and publishes best-effort activity without affecting event processing.
   */
  public record(activity: OperationalActivity): void {
    try {
      this.store.record(activity);
      this.publisher.publish(activity);
    } catch (error) {
      console.warn('Live-feed operational activity observation failed.', {
        message: error instanceof Error ? error.message : 'unknown_error',
      });
    }
  }
}
