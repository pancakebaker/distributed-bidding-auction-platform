/** Socket.IO admission handlers for public auction-room subscriptions. */

import type { Socket } from 'socket.io';
import type { LiveFeedSubscriptionAuthorizer } from '../../application/live-feed-subscription-authorizer.js';
import type { LiveFeedStateStore } from '../../infrastructure/cache/redis-state.js';
import { auctionSocketEvents } from '../../domain/transport.js';
import { auctionRoom, parseAuctionSubscription } from './rooms.js';

type SubscriptionAcknowledgement = (response: {
  ok: boolean;
  room?: string;
  error?: string;
}) => void;

/** Wires the public auction subscription boundary without affecting the admin channel. */
export function registerAuctionSubscriptionHandlers(
  socket: Socket,
  stateStore: Pick<LiveFeedStateStore, 'getProjection'>,
  authorizer: LiveFeedSubscriptionAuthorizer,
): void {
  socket.on(
    auctionSocketEvents.subscribe,
    async (value: unknown, acknowledge?: SubscriptionAcknowledgement) => {
      const subscription = parseAuctionSubscription(value);

      if (!subscription) {
        acknowledge?.({ ok: false, error: 'invalid_auction_id' });
        return;
      }

      let decision;
      try {
        decision = await authorizer.authorize(subscription.auctionId);
      } catch {
        acknowledge?.({ ok: false, error: 'live_feed_unavailable' });
        return;
      }
      if (decision.kind !== 'allowed') {
        acknowledge?.({ ok: false, error: subscriptionError(decision.kind) });
        return;
      }

      try {
        const room = await resolveSubscriptionRoom(
          stateStore,
          subscription.auctionId,
          subscription.tenantId,
        );
        if (!room) {
          acknowledge?.({ ok: false, error: 'live_feed_unavailable' });
          return;
        }

        await socket.join(room);
        acknowledge?.({ ok: true, room });
      } catch {
        acknowledge?.({ ok: false, error: 'live_feed_unavailable' });
      }
    },
  );

  socket.on(
    auctionSocketEvents.unsubscribe,
    async (value: unknown, acknowledge?: SubscriptionAcknowledgement) => {
      const subscription = parseAuctionSubscription(value);

      if (!subscription) {
        acknowledge?.({ ok: false, error: 'invalid_auction_id' });
        return;
      }

      try {
        const room = await resolveSubscriptionRoom(
          stateStore,
          subscription.auctionId,
          subscription.tenantId,
        );
        if (!room) {
          acknowledge?.({ ok: false, error: 'auction_not_found' });
          return;
        }
        void socket.leave(room);
        acknowledge?.({ ok: true, room });
      } catch {
        acknowledge?.({ ok: false, error: 'live_feed_unavailable' });
      }
    },
  );
}

async function resolveSubscriptionRoom(
  stateStore: Pick<LiveFeedStateStore, 'getProjection'>,
  auctionId: string,
  requestedTenantId?: string,
): Promise<string | null> {
  const projection = await stateStore.getProjection(auctionId);
  if (projection) {
    return !requestedTenantId || requestedTenantId === projection.tenantId
      ? auctionRoom(projection.tenantId, auctionId)
      : null;
  }

  // Bidding is authoritative for existence and status; the client tenant is used only
  // to preserve the established room name when this non-authoritative projection lags.
  return requestedTenantId ? auctionRoom(requestedTenantId, auctionId) : null;
}

function subscriptionError(
  kind: 'denied' | 'not_found' | 'unavailable' | 'unauthorized_internal_service',
): string {
  if (kind === 'denied') return 'subscription_denied';
  if (kind === 'not_found') return 'auction_not_found';
  return 'live_feed_unavailable';
}
