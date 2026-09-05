import { io, type Socket } from 'socket.io-client';
import type { LiveBidAccepted } from './types';

const liveFeedUrl = import.meta.env.VITE_LIVE_FEED_URL ?? 'http://localhost:3001';

export type LiveFeedHandlers = {
    onBidAccepted: (event: LiveBidAccepted) => void;
    onStatus: (status: 'connected' | 'reconnecting' | 'offline') => void;
};

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

    return socket;
}
