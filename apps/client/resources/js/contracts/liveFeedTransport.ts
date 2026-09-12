/** Browser-facing Socket.IO identifiers shared with the live-feed service. */
export const liveFeedSocketEvents = {
    bidAccepted: 'bid:accepted',
    auctionClosed: 'auction:closed',
    winnerSelected: 'winner:selected',
    subscribe: 'auction:subscribe',
    unsubscribe: 'auction:unsubscribe',
} as const;
