/** Queries Bidding Service for authoritative Live Feed admission decisions. */
import type { LiveFeedAccessDecision, LiveFeedAccessPort } from '../../application/ports/live-feed-access.js';
import { getContext } from '../../infrastructure/runtime/async-context.js';
import type { ServiceTokenIssuer } from '../auth/service-token-issuer.js';

/** Configuration for the internal Bidding Service access client. */
export type BiddingLiveFeedAccessClientOptions = {
  baseUrl: string;
  issuer: ServiceTokenIssuer;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

/** Fails closed when the trusted Bidding Service decision is unavailable. */
export class BiddingLiveFeedAccessClient implements LiveFeedAccessPort {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  public constructor(private readonly options: BiddingLiveFeedAccessClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 3000;
  }

  /** Requests whether the specified auction may be exposed publicly. */
  public async canExposeAuctionLiveFeed(auctionId: string): Promise<LiveFeedAccessDecision> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const context = getContext();
      const response = await this.fetchImpl(`${this.options.baseUrl.replace(/\/$/, '')}/internal/live-feed/access`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.options.issuer.issue()}`,
          'content-type': 'application/json',
          ...(context?.correlationId ? { 'x-correlation-id': context.correlationId } : {}),
        },
        body: JSON.stringify({ auctionId }),
        signal: controller.signal,
      });
      if (response.status === 200) return { kind: 'allowed' };
      if (response.status === 403) return { kind: 'denied' };
      if (response.status === 404) return { kind: 'not_found' };
      if (response.status === 401) return { kind: 'unauthorized_internal_service' };
      return { kind: 'unavailable' };
    } catch {
      return { kind: 'unavailable' };
    } finally {
      clearTimeout(timeout);
    }
  }
}
