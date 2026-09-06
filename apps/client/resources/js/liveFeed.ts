/**
 * Socket.IO client adapter for subscribing to live auction updates from the live-feed service.
 */
import { io, type Socket } from 'socket.io-client';
import type { LiveAuctionClosed, LiveBidAccepted, LiveWinnerSelected } from './types';

const liveFeedUrl = import.meta.env.VITE_LIVE_FEED_URL ?? 'http://localhost:3001';

/**
 * Callbacks invoked by the Socket.IO live-feed adapter as auction events arrive.
 */
export type LiveFeedHandlers = {
    onBidAccepted: (event: LiveBidAccepted) => void;
    onAuctionClosed: (event: LiveAuctionClosed) => void;
    onWinnerSelected: (event: LiveWinnerSelected) => void;
    onStatus: (status: 'connected' | 'reconnecting' | 'offline') => void;
};

/**
 * Connects to the live-feed service and subscribes the socket to one auction room.
 */
export function connectAuctionFeed(auctionId: string, handlers: LiveFeedHandlers): Socket {
    const socket = io(liveFeedUrl, {
        transports: ['websocket'],
        reconnectionAttempts: Infinity,
    });

    socket.on('connect', () => {
        handlers.onStatus('connected');
        socket.emit('auction:subscribe', auctionId);
    });

    socket.io.on('reconnect_attempt', () => handlers.onStatus('reconnecting'));
    socket.on('disconnect', () => handlers.onStatus('offline'));
    socket.on('connect_error', () => handlers.onStatus('offline'));
    socket.on('bid:accepted', handlers.onBidAccepted);
    socket.on('auction:closed', handlers.onAuctionClosed);
    socket.on('winner:selected', handlers.onWinnerSelected);

    return socket;
}
