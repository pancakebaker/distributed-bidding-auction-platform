/** Stable RabbitMQ routing keys for integration events consumed by live-feed. */
export const integrationEventRoutingKeys = {
  bidAccepted: 'auction.bid.accepted',
  auctionClosed: 'auction.closed',
  winnerSelected: 'auction.winner.selected',
} as const;
