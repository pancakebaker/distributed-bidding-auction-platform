import { describe, expect, it } from 'vitest';
import { liveFeedSocketEvents } from './liveFeedTransport';

describe('live-feed Socket.IO transport contract', () => {
    it('keeps browser-facing wire values aligned with live-feed', () => {
        expect(liveFeedSocketEvents).toEqual({
            bidAccepted: 'bid:accepted',
            auctionClosed: 'auction:closed',
            winnerSelected: 'winner:selected',
            subscribe: 'auction:subscribe',
            unsubscribe: 'auction:unsubscribe',
        });
    });
});
