/** Stable RabbitMQ routing keys for integration events consumed by live-feed. */
export const integrationEventRoutingKeys = {
  bidAccepted: 'auction.bid.accepted',
  auctionClosed: 'auction.closed',
  winnerSelected: 'auction.winner.selected',
} as const;

/** Browser-facing auction Socket.IO events and subscription controls. */
export const auctionSocketEvents = {
  bidAccepted: 'bid:accepted',
  auctionClosed: 'auction:closed',
  winnerSelected: 'winner:selected',
  subscribe: 'auction:subscribe',
  unsubscribe: 'auction:unsubscribe',
} as const;

/** Socket.IO identifiers used by the live-feed administrative dashboard. */
export const adminSocketEvents = {
  subscribe: 'admin:subscribe',
  activity: 'admin:activity',
  subscriptionError: 'subscription:error',
} as const;

/** Fixed Socket.IO rooms owned by the live-feed transport. */
export const adminSocketRooms = {
  liveFeed: 'admin:live-feed',
} as const;
