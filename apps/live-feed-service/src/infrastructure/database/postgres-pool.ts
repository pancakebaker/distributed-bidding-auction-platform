/**
 * Reusable PostgreSQL connection-pool infrastructure for optional live-feed history.
 */
import { Pool } from 'pg';
import type { PoolConfig, QueryResult, QueryResultRow } from 'pg';

/**
 * Safe pool metrics that omit connection strings and credentials.
 */
export type PostgresPoolStatus = {
  totalCount: number;
  idleCount: number;
  waitingCount: number;
};

/**
 * Owns one bounded PostgreSQL pool per live-feed service instance.
 */
export class PostgresPool {
  private readonly pool: Pool;
  private closePromise: Promise<void> | null = null;

  public constructor(config: PoolConfig) {
    this.pool = new Pool(config);
    this.pool.on('error', (error) => {
      console.warn('Live-feed history PostgreSQL pool error.', { message: error.message });
    });
  }

  /**
   * Executes a parameterized query through the shared pool.
   */
  public query<Row extends QueryResultRow>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<QueryResult<Row>> {
    return this.pool.query<Row>(text, values as unknown[]);
  }

  /**
   * Returns safe pool counters for diagnostics.
   */
  public status(): PostgresPoolStatus {
    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
    };
  }

  /**
   * Ends the pool once and waits for checked-out clients to finish.
   */
  public async close(): Promise<void> {
    if (!this.closePromise) {
      this.closePromise = this.pool.end().catch((error: unknown) => {
        this.closePromise = null;
        throw error;
      });
    }

    await this.closePromise;
  }
}
