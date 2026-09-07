/**
 * Developer-only Socket.IO client for observing live auction events during local demos.
 */
import { io } from 'socket.io-client';

const liveFeedUrl = process.env.LIVE_FEED_URL ?? 'http://localhost:3001';
const auctionId = process.env.AUCTION_ID ?? process.argv[2];

if (!auctionId) {
  console.error('Provide an auction ID with AUCTION_ID=<uuid> or as the first argument.');
  process.exit(1);
}

const socket = io(liveFeedUrl, {
  transports: ['websocket'],
  reconnectionAttempts: 5,
});

socket.on('connect', () => {
  console.log(`Connected to ${liveFeedUrl}`);
  socket.emit('auction:subscribe', auctionId, (response: { ok: boolean; room?: string; error?: string }) => {
    if (!response.ok) {
      console.error(`Subscription failed: ${response.error}`);
      process.exitCode = 1;
      socket.disconnect();
      return;
    }

    console.log(`Subscribed to ${response.room}`);
  });
});

socket.on('bid:accepted', (payload) => {
  console.log('bid:accepted', JSON.stringify(payload, null, 2));
});

socket.on('auction:closed', (payload) => {
  console.log('auction:closed', JSON.stringify(payload, null, 2));
});

socket.on('winner:selected', (payload) => {
  console.log('winner:selected', JSON.stringify(payload, null, 2));
});

socket.on('subscription:error', (payload) => {
  console.error('Subscription error', payload);
});

socket.on('connect_error', (error) => {
  console.error('Connection error', error.message);
});
