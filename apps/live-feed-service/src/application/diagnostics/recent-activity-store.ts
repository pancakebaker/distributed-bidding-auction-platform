/**
 * Bounded in-memory operational activity storage for the live-feed admin page.
 */

/**
 * Safe metadata captured after an observed live-feed processing outcome.
 */
export type OperationalActivity = {
  eventId: string;
  eventType: string;
  auctionId?: string;
  aggregateVersion?: number;
  buyerId?: string;
  finalPrice?: number;
  correlationId?: string;
  receivedAt: string;
  outcome: 'applied' | 'stale' | 'ignored' | 'error';
};

/**
 * Read-only snapshot interface for bounded operational activity.
 */
export interface RecentActivityReader {
  /**
   * Returns a detached newest-first activity snapshot.
   */
  snapshot(): readonly OperationalActivity[];
}

/**
 * Fixed-capacity in-memory ring buffer; it is not an event store or audit log.
 */
export class RecentActivityStore implements RecentActivityReader {
  private readonly items: OperationalActivity[] = [];

  public constructor(private readonly capacity = 50) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new Error('Recent activity capacity must be a positive integer.');
    }
  }

  /**
   * Appends an item and evicts the oldest item when capacity is reached.
   */
  public append(activity: OperationalActivity): void {
    this.items.unshift({ ...activity });
    if (this.items.length > this.capacity) {
      this.items.pop();
    }
  }

  /**
   * Returns a detached newest-first snapshot that cannot mutate the buffer.
   */
  public snapshot(): readonly OperationalActivity[] {
    return this.items.map((item) => ({ ...item }));
  }

  /**
   * Records an item through the application-facing observer port.
   */
  public record(activity: OperationalActivity): void {
    this.append(activity);
  }
}
