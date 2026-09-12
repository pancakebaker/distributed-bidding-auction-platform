import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { liveFeedSocketEvents } from './contracts/liveFeedTransport';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuctionApp as App } from './app/AuctionApp';
import type {
    AuctionDetail,
    AuctionSummary,
    Bid,
    LiveAuctionPurchased,
    LiveAuctionCancelled,
    LiveAuctionClosed,
    LiveBidAccepted,
    LiveWinnerSelected,
} from './types';

const socketHandlers = new Map<string, (...args: any[]) => void>();
const socketIoHandlers = new Map<string, (...args: any[]) => void>();
const emitMock = vi.fn();
const disconnectMock = vi.fn();

vi.mock('socket.io-client', () => ({
    io: vi.fn(() => ({
        on: (event: string, handler: (...args: any[]) => void) => {
            socketHandlers.set(event, handler);
        },
        emit: emitMock,
        disconnect: disconnectMock,
        io: {
            on: (event: string, handler: (...args: any[]) => void) => {
                socketIoHandlers.set(event, handler);
            },
        },
    })),
}));

const macBook: AuctionDetail = {
    id: '11111111-1111-1111-1111-111111111111',
    title: 'MacBook Pro',
    description: 'Developer laptop demo auction.',
    startingPrice: 1000,
    saleMode: 'AuctionOnly',
    buyNowPrice: null,
    minimumBidIncrement: 50,
    currentBidAmount: 1500,
    currentBidderId: 'erin',
    finalWinnerId: null,
    finalPrice: null,
    minimumValidBid: 1550,
    status: 'Open',
    startTimeUtc: new Date(Date.now() - 60_000).toISOString(),
    endTimeUtc: new Date(Date.now() + 3_600_000).toISOString(),
    createdAtUtc: new Date(Date.now() - 120_000).toISOString(),
    updatedAtUtc: new Date(Date.now() - 30_000).toISOString(),
    version: 9,
};

const auctions: AuctionSummary[] = [
    macBook,
    {
        id: '22222222-2222-2222-2222-222222222222',
        title: 'Camera',
        startingPrice: 500,
        saleMode: 'AuctionOnly',
        buyNowPrice: null,
        minimumBidIncrement: 25,
        currentBidAmount: null,
        currentBidderId: null,
        finalWinnerId: null,
        finalPrice: null,
        minimumValidBid: 500,
        status: 'Scheduled',
        startTimeUtc: new Date(Date.now() + 3_600_000).toISOString(),
        endTimeUtc: new Date(Date.now() + 7_200_000).toISOString(),
        version: 1,
    },
    {
        id: '33333333-3333-3333-3333-333333333333',
        title: 'Gaming Console',
        startingPrice: 300,
        saleMode: 'AuctionOnly',
        buyNowPrice: null,
        minimumBidIncrement: 20,
        currentBidAmount: 380,
        currentBidderId: 'diana',
        finalWinnerId: 'diana',
        finalPrice: 380,
        minimumValidBid: 400,
        status: 'Closed',
        startTimeUtc: new Date(Date.now() - 7_200_000).toISOString(),
        endTimeUtc: new Date(Date.now() - 3_600_000).toISOString(),
        version: 2,
    },
];

const bids: Bid[] = [
    {
        id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
        auctionId: macBook.id,
        bidderId: 'erin',
        amount: 1500,
        createdAtUtc: new Date(Date.now() - 30_000).toISOString(),
    },
];

const buyNowOnlyAuction: AuctionDetail = {
    ...macBook,
    saleMode: 'BuyNowOnly',
    buyNowPrice: 2000,
    currentBidAmount: null,
    currentBidderId: null,
    finalWinnerId: null,
    finalPrice: null,
    minimumValidBid: 1000,
};

const auctionAndBuyNowAtCeiling: AuctionDetail = {
    ...macBook,
    saleMode: 'AuctionAndBuyNow',
    buyNowPrice: 1000,
    currentBidAmount: 990,
    currentBidderId: 'erin',
    finalWinnerId: null,
    finalPrice: null,
    minimumValidBid: 1015,
};

const auctionAndBuyNowWithBid: AuctionDetail = {
    ...macBook,
    saleMode: 'AuctionAndBuyNow',
    buyNowPrice: 2000,
    finalWinnerId: null,
    finalPrice: null,
};

function json(data: unknown, status = 200) {
    return Promise.resolve(
        new Response(JSON.stringify(data), {
            status,
            headers: { 'Content-Type': 'application/json' },
        }),
    );
}

function mockFetch() {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url.endsWith('/api/auctions') && !init?.method) {
            return json(auctions);
        }

        if (url.endsWith(`/api/auctions/${macBook.id}`) && !init?.method) {
            return json(macBook);
        }

        if (url.endsWith(`/api/auctions/${macBook.id}/bids`) && !init?.method) {
            return json(bids);
        }

        if (url.endsWith(`/api/auctions/${macBook.id}/bids`) && init?.method === 'POST') {
            return json(
                {
                    bidId: 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
                    auctionId: macBook.id,
                    bidderId: 'alice',
                    amount: 1600,
                    currentBidAmount: 1600,
                    currentBidderId: 'alice',
                    nextMinimumBid: 1650,
                    auctionVersion: 10,
                    createdAtUtc: new Date().toISOString(),
                    correlationId: 'test-correlation',
                },
                201,
            );
        }

        return json({ code: 'not_found', message: 'Not found.' }, 404);
    });

    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { randomUUID: () => 'client-correlation-id' });
    return fetchMock;
}

function renderAt(path: string) {
    window.history.pushState({}, '', path);
    return render(<App />);
}

function live(event: LiveBidAccepted) {
    socketHandlers.get(liveFeedSocketEvents.bidAccepted)?.(event);
}

function liveClosed(event: LiveAuctionClosed) {
    socketHandlers.get(liveFeedSocketEvents.auctionClosed)?.(event);
}

function liveWinner(event: LiveWinnerSelected) {
    socketHandlers.get(liveFeedSocketEvents.winnerSelected)?.(event);
}

function livePurchased(event: LiveAuctionPurchased) {
    socketHandlers.get(liveFeedSocketEvents.auctionPurchased)?.(event);
}

function liveCancelled(event: LiveAuctionCancelled) {
    socketHandlers.get(liveFeedSocketEvents.auctionCancelled)?.(event);
}
describe('auction UI', () => {
    beforeEach(() => {
        socketHandlers.clear();
        socketIoHandlers.clear();
        emitMock.mockClear();
        disconnectMock.mockClear();
        mockFetch();
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    it('auction list renders API data', async () => {
        renderAt('/auctions');

        expect(await screen.findByText('MacBook Pro')).toBeInTheDocument();
        expect(screen.getByText('Camera')).toBeInTheDocument();
        expect(screen.getByText('Gaming Console')).toBeInTheDocument();
    });

    it('auction detail renders current bid and bid history', async () => {
        renderAt(`/auctions/${macBook.id}`);

        expect(await screen.findByRole('heading', { name: 'MacBook Pro' })).toBeInTheDocument();
        expect(screen.getAllByText('$1,500').length).toBeGreaterThan(0);
        expect(screen.getByText('erin')).toBeInTheDocument();
    });

    it('valid bid form submits expected payload and disables while pending', async () => {
        const user = userEvent.setup();
        const fetchMock = vi.mocked(fetch);
        let resolvePost: ((value: Response) => void) | undefined;

        fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            if (url.endsWith(`/api/auctions/${macBook.id}/bids`) && init?.method === 'POST') {
                return new Promise<Response>((resolve) => {
                    resolvePost = resolve;
                });
            }
            if (url.endsWith(`/api/auctions/${macBook.id}/bids`)) return json(bids);
            if (url.endsWith(`/api/auctions/${macBook.id}`)) return json(macBook);
            return json(auctions);
        });

        renderAt(`/auctions/${macBook.id}`);

        await screen.findByRole('heading', { name: 'MacBook Pro' });
        const input = screen.getByLabelText('Bid amount');
        await user.clear(input);
        await user.type(input, '1600');
        await user.click(screen.getByRole('button', { name: 'Place bid' }));

        expect(screen.getByRole('button', { name: 'Placing bid...' })).toBeDisabled();
        if (!resolvePost) {
            throw new Error('POST promise resolver was not captured.');
        }

        const completePost = resolvePost;
        completePost(
            new Response(
                JSON.stringify({
                    bidId: 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
                    auctionId: macBook.id,
                    bidderId: 'alice',
                    amount: 1600,
                    currentBidAmount: 1600,
                    currentBidderId: 'alice',
                    nextMinimumBid: 1650,
                    auctionVersion: 10,
                    createdAtUtc: new Date().toISOString(),
                    correlationId: 'test-correlation',
                }),
                { status: 201, headers: { 'Content-Type': 'application/json' } },
            ),
        );
        await screen.findByText('Your bid was accepted.');
        expect(screen.getByLabelText('Bid amount')).toHaveValue('1650');
        expect(screen.queryByText('alice placed $1,600')).not.toBeInTheDocument();

        const postCall = fetchMock.mock.calls.find(
            (call) =>
                String(call[0]).endsWith(`/api/auctions/${macBook.id}/bids`) &&
                call[1]?.method === 'POST',
        );
        expect(postCall?.[1]?.body).toBe(JSON.stringify({ bidderId: 'Alice', amount: 1600 }));
        expect((postCall?.[1]?.headers as Record<string, string>)['X-Correlation-ID']).toBe(
            'client-correlation-id',
        );
    });

    it('bid_below_minimum error is displayed and refreshes state', async () => {
        vi.mocked(fetch).mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            if (init?.method === 'POST') {
                return json(
                    {
                        code: 'bid_below_minimum',
                        message: 'Too low.',
                        details: {
                            currentBidAmount: 1500,
                            minimumValidBid: 1550,
                            auctionVersion: 9,
                        },
                    },
                    400,
                );
            }
            if (url.endsWith(`/api/auctions/${macBook.id}/bids`)) return json(bids);
            if (url.endsWith(`/api/auctions/${macBook.id}`)) return json(macBook);
            return json(auctions);
        });

        const user = userEvent.setup();
        renderAt(`/auctions/${macBook.id}`);
        await screen.findByRole('heading', { name: 'MacBook Pro' });
        await user.click(screen.getByRole('button', { name: 'Place bid' }));

        expect(
            await screen.findByText('Bid is below the current minimum of $1,550.'),
        ).toBeInTheDocument();
    });

    it('auction_not_open error is displayed', async () => {
        vi.mocked(fetch).mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            if (init?.method === 'POST') {
                return json({ code: 'auction_not_open', message: 'Closed.' }, 409);
            }
            if (url.endsWith(`/api/auctions/${macBook.id}/bids`)) return json(bids);
            if (url.endsWith(`/api/auctions/${macBook.id}`)) return json(macBook);
            return json(auctions);
        });

        const user = userEvent.setup();
        renderAt(`/auctions/${macBook.id}`);
        await screen.findByRole('heading', { name: 'MacBook Pro' });
        await user.click(screen.getByRole('button', { name: 'Place bid' }));

        expect(
            await screen.findByText('This auction is not accepting bids right now.'),
        ).toBeInTheDocument();
    });

    it('live BidAccepted event updates current bid and history', async () => {
        renderAt(`/auctions/${macBook.id}`);
        await screen.findByRole('heading', { name: 'MacBook Pro' });

        live({
            auctionId: macBook.id,
            bidId: 'cccccccc-3333-4333-8333-cccccccccccc',
            bidderId: 'bob',
            amount: 1700,
            auctionVersion: 11,
            occurredAtUtc: new Date().toISOString(),
            correlationId: 'live-test',
        });

        await waitFor(() => expect(screen.getAllByText('$1,700').length).toBeGreaterThan(0));
        expect(screen.getByText('Highest bidder: bob')).toBeInTheDocument();
        expect(screen.getByLabelText('Bid amount')).toHaveValue('1750');
        expect(screen.getByText('bob bid $1,700')).toBeInTheDocument();
    });

    it('stale live event is ignored', async () => {
        renderAt(`/auctions/${macBook.id}`);
        await screen.findByRole('heading', { name: 'MacBook Pro' });

        live({
            auctionId: macBook.id,
            bidId: 'dddddddd-4444-4444-8444-dddddddddddd',
            bidderId: 'charlie',
            amount: 1400,
            auctionVersion: 8,
            occurredAtUtc: new Date().toISOString(),
            correlationId: 'stale-test',
        });

        expect(screen.queryByText('$1,400')).not.toBeInTheDocument();
        expect(screen.getAllByText('$1,500').length).toBeGreaterThan(0);
    });

    it('live event for another auction is ignored', async () => {
        renderAt(`/auctions/${macBook.id}`);
        await screen.findByRole('heading', { name: 'MacBook Pro' });

        live({
            auctionId: '99999999-9999-9999-9999-999999999999',
            bidId: 'eeeeeeee-5555-4555-8555-eeeeeeeeeeee',
            bidderId: 'diana',
            amount: 1800,
            auctionVersion: 12,
            occurredAtUtc: new Date().toISOString(),
            correlationId: 'other-auction',
        });

        expect(screen.queryByText('$1,800')).not.toBeInTheDocument();
    });

    it('connection status changes appropriately', async () => {
        renderAt(`/auctions/${macBook.id}`);
        await screen.findByRole('heading', { name: 'MacBook Pro' });

        socketHandlers.get('connect')?.();
        expect(await screen.findByText('Live connected')).toBeInTheDocument();
        socketIoHandlers.get('reconnect_attempt')?.();
        expect((await screen.findAllByText('Reconnecting')).length).toBeGreaterThan(0);
        socketHandlers.get('disconnect')?.();
        expect((await screen.findAllByText('Offline')).length).toBeGreaterThan(0);
    });

    it('subscribes to the current auction room when live feed connects', async () => {
        renderAt(`/auctions/${macBook.id}`);
        await screen.findByRole('heading', { name: 'MacBook Pro' });

        socketHandlers.get('connect')?.();

        expect(emitMock).toHaveBeenCalledWith(liveFeedSocketEvents.subscribe, macBook.id);
    });

    it('disconnects the live feed subscription when the auction detail unmounts', async () => {
        const rendered = renderAt(`/auctions/${macBook.id}`);
        await screen.findByRole('heading', { name: 'MacBook Pro' });

        rendered.unmount();

        expect(disconnectMock).toHaveBeenCalledTimes(1);
    });
    it('auction concurrency conflict displays refresh guidance', async () => {
        vi.mocked(fetch).mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            if (init?.method === 'POST') {
                return json({ code: 'auction_concurrency_conflict', message: 'Changed.' }, 409);
            }
            if (url.endsWith(`/api/auctions/${macBook.id}/bids`)) return json(bids);
            if (url.endsWith(`/api/auctions/${macBook.id}`)) return json(macBook);
            return json(auctions);
        });

        const user = userEvent.setup();
        renderAt(`/auctions/${macBook.id}`);
        await screen.findByRole('heading', { name: 'MacBook Pro' });
        await user.click(screen.getByRole('button', { name: 'Place bid' }));

        expect(
            await screen.findByText(
                'Auction state changed while bidding. Refreshing latest state.',
            ),
        ).toBeInTheDocument();
    });
    it('auction:closed updates status and disables bidding', async () => {
        renderAt(`/auctions/${macBook.id}`);
        await screen.findByRole('heading', { name: 'MacBook Pro' });

        liveClosed({
            auctionId: macBook.id,
            closedAtUtc: new Date().toISOString(),
            finalBidAmount: 1500,
            finalBidderId: 'erin',
            auctionVersion: 10,
            correlationId: 'close-test',
        });

        expect(await screen.findByText('This auction is now closed.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Auction closed' })).toBeDisabled();
        expect(screen.getByLabelText('Bid amount')).toBeDisabled();
        expect(screen.getByText('Final bid $1,500')).toBeInTheDocument();
        expect(screen.getAllByText('Winner: erin').length).toBeGreaterThan(0);
    });

    it('auction:cancelled preserves history and disables actions without a winner', async () => {
        renderAt(`/auctions/${macBook.id}`);
        await screen.findByRole('heading', { name: 'MacBook Pro' });

        liveCancelled({
            auctionId: macBook.id,
            status: 'Cancelled',
            auctionVersion: 10,
            occurredAtUtc: new Date().toISOString(),
            correlationId: 'cancel-test',
        });

        expect(
            await screen.findByText(
                'This auction was cancelled and is no longer accepting activity.',
            ),
        ).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Auction cancelled' })).toBeDisabled();
        expect(screen.getByLabelText('Bid amount')).toBeDisabled();
        expect(
            screen.getByText('Bidding and Buy Now are no longer available.'),
        ).toBeInTheDocument();
        expect(
            screen.getByText('Existing bid history is preserved; no winner was selected.'),
        ).toBeInTheDocument();
    });

    it('winner:selected displays winner state for the acting bidder', async () => {
        renderAt(`/auctions/${macBook.id}`);
        await screen.findByRole('heading', { name: 'MacBook Pro' });

        liveWinner({
            auctionId: macBook.id,
            winningBidId: 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
            winnerId: 'Alice',
            amount: 1700,
            selectedAtUtc: new Date().toISOString(),
            auctionVersion: 10,
            correlationId: 'winner-test',
        });

        expect(await screen.findByText('You won this auction.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Auction closed' })).toBeDisabled();
        expect(screen.getByText('Final bid $1,700')).toBeInTheDocument();
    });

    it('no-bid auction close renders without waiting for a winner event', async () => {
        renderAt(`/auctions/${macBook.id}`);
        await screen.findByRole('heading', { name: 'MacBook Pro' });

        liveClosed({
            auctionId: macBook.id,
            closedAtUtc: new Date().toISOString(),
            finalBidAmount: null,
            finalBidderId: null,
            auctionVersion: 10,
            correlationId: 'no-bid-close',
        });

        expect(await screen.findByText('No bids were placed.')).toBeInTheDocument();
        expect(screen.getByText('No winner was selected.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Auction closed' })).toBeDisabled();
    });

    it('lower-version lifecycle event is ignored', async () => {
        renderAt(`/auctions/${macBook.id}`);
        await screen.findByRole('heading', { name: 'MacBook Pro' });

        liveClosed({
            auctionId: macBook.id,
            closedAtUtc: new Date().toISOString(),
            finalBidAmount: 1500,
            finalBidderId: 'erin',
            auctionVersion: 8,
            correlationId: 'stale-close',
        });

        expect(screen.queryByText('This auction is now closed.')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Place bid' })).not.toBeDisabled();
    });

    it('same-version sibling lifecycle event is accepted', async () => {
        renderAt(`/auctions/${macBook.id}`);
        await screen.findByRole('heading', { name: 'MacBook Pro' });

        liveClosed({
            auctionId: macBook.id,
            closedAtUtc: new Date().toISOString(),
            finalBidAmount: 1700,
            finalBidderId: 'bob',
            auctionVersion: 10,
            correlationId: 'same-version',
        });
        liveWinner({
            auctionId: macBook.id,
            winningBidId: 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
            winnerId: 'Alice',
            amount: 1700,
            selectedAtUtc: new Date().toISOString(),
            auctionVersion: 10,
            correlationId: 'same-version',
        });

        expect(await screen.findByText('You won this auction.')).toBeInTheDocument();
        expect(screen.getByText('Winner selected: Alice')).toBeInTheDocument();
    });

    it('sale modes render the appropriate actions', async () => {
        const user = userEvent.setup();
        vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) => {
            const url = String(input);
            if (url.endsWith(`/api/auctions/${macBook.id}/bids`)) return json([]);
            if (url.endsWith(`/api/auctions/${macBook.id}`)) return json(buyNowOnlyAuction);
            return json(auctions);
        });

        renderAt(`/auctions/${macBook.id}`);
        expect((await screen.findAllByText('Buy Now price')).length).toBeGreaterThan(0);
        expect(screen.queryByLabelText('Bid amount')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Buy Now' })).toBeEnabled();

        cleanup();
        vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) => {
            const url = String(input);
            if (url.endsWith(`/api/auctions/${macBook.id}/bids`)) return json([]);
            if (url.endsWith(`/api/auctions/${macBook.id}`)) return json(macBook);
            return json(auctions);
        });
        renderAt(`/auctions/${macBook.id}`);
        await screen.findByRole('heading', { name: 'MacBook Pro' });
        expect(screen.getByLabelText('Bid amount')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Buy Now' })).not.toBeInTheDocument();

        cleanup();
        vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) => {
            const url = String(input);
            if (url.endsWith(`/api/auctions/${macBook.id}/bids`)) return json(bids);
            if (url.endsWith(`/api/auctions/${macBook.id}`)) return json(auctionAndBuyNowWithBid);
            return json(auctions);
        });
        renderAt(`/auctions/${macBook.id}`);
        await screen.findByRole('heading', { name: 'MacBook Pro' });
        expect(screen.getByRole('button', { name: 'Place bid' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'Buy Now' })).toBeEnabled();
        expect(user).toBeDefined();
    });

    it('Buy Now requires confirmation and sends only bidder identity', async () => {
        const user = userEvent.setup();
        const fetchMock = vi.mocked(fetch);
        fetchMock.mockImplementation((input: RequestInfo | URL, _init?: RequestInit) => {
            const url = String(input);
            if (url.endsWith(`/api/auctions/${macBook.id}/bids`)) return json([]);
            if (url.endsWith(`/api/auctions/${macBook.id}/buy-now`)) {
                return json(
                    {
                        auctionId: macBook.id,
                        bidderId: 'alice',
                        finalPrice: 2000,
                        auctionVersion: 10,
                        purchasedAtUtc: new Date().toISOString(),
                        correlationId: 'purchase-correlation',
                    },
                    201,
                );
            }
            if (url.endsWith(`/api/auctions/${macBook.id}`)) return json(buyNowOnlyAuction);
            return json(auctions);
        });

        renderAt(`/auctions/${macBook.id}`);
        await screen.findByRole('button', { name: 'Buy Now' });
        await user.click(screen.getByRole('button', { name: 'Buy Now' }));
        expect(screen.getByText(/Confirm purchase of MacBook Pro for \$2,000/)).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Confirm Buy Now' }));

        expect(await screen.findByText('Your Buy Now purchase was completed.')).toBeInTheDocument();
        expect(screen.getByText('Final price $2,000')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Buy Now unavailable' })).toBeDisabled();
        const post = fetchMock.mock.calls.find(
            (call) => String(call[0]).endsWith('/buy-now') && call[1]?.method === 'POST',
        );
        expect(post?.[1]?.body).toBe(JSON.stringify({ bidderId: 'Alice' }));
        expect(post?.[1]?.body).not.toContain('price');
    });

    it('Buy Now and closed siblings preserve purchase state without overwriting ordinary bid state', async () => {
        vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) => {
            const url = String(input);
            if (url.endsWith(`/api/auctions/${macBook.id}/bids`)) return json(bids);
            if (url.endsWith(`/api/auctions/${macBook.id}`)) return json(auctionAndBuyNowWithBid);
            return json(auctions);
        });
        renderAt(`/auctions/${macBook.id}`);
        await screen.findByRole('heading', { name: 'MacBook Pro' });

        livePurchased({
            auctionId: macBook.id,
            bidderId: 'buyer-b',
            finalPrice: 2000,
            auctionVersion: 12,
            purchasedAtUtc: new Date().toISOString(),
            occurredAtUtc: new Date().toISOString(),
            correlationId: 'purchase',
        });
        liveClosed({
            auctionId: macBook.id,
            closedAtUtc: new Date().toISOString(),
            finalBidAmount: 1500,
            finalBidderId: 'erin',
            auctionVersion: 12,
            correlationId: 'purchase',
        });

        expect(await screen.findByText('Final price $2,000')).toBeInTheDocument();
        expect(screen.getAllByText('Winner: buyer-b').length).toBeGreaterThan(0);
        expect(screen.getAllByText('$1,500').length).toBeGreaterThan(0);
        expect(screen.queryByRole('button', { name: 'Place bid' })).not.toBeInTheDocument();
    });

    it('Buy Now conflicts refresh authoritative state without retrying the command', async () => {
        const user = userEvent.setup();
        const fetchMock = vi.mocked(fetch);
        let detailRequests = 0;
        let purchaseRequests = 0;
        const closedPurchase = {
            ...buyNowOnlyAuction,
            status: 'Closed',
            finalWinnerId: 'buyer-other',
            finalPrice: 2000,
            version: 10,
            endTimeUtc: new Date(Date.now() - 1000).toISOString(),
        } satisfies AuctionDetail;
        fetchMock.mockImplementation((input: RequestInfo | URL, _init?: RequestInit) => {
            const url = String(input);
            if (url.endsWith(`/api/auctions/${macBook.id}/bids`)) return json([]);
            if (url.endsWith(`/api/auctions/${macBook.id}/buy-now`)) {
                purchaseRequests += 1;
                return json(
                    { code: 'auction_not_open', message: 'Auction is no longer open.' },
                    409,
                );
            }
            if (url.endsWith(`/api/auctions/${macBook.id}`)) {
                detailRequests += 1;
                return json(detailRequests === 1 ? buyNowOnlyAuction : closedPurchase);
            }
            return json(auctions);
        });

        renderAt(`/auctions/${macBook.id}`);
        await screen.findByRole('button', { name: 'Buy Now' });
        await user.click(screen.getByRole('button', { name: 'Buy Now' }));
        await user.click(screen.getByRole('button', { name: 'Confirm Buy Now' }));

        expect(await screen.findByText('This auction is no longer open.')).toBeInTheDocument();
        expect(await screen.findByText('Final price $2,000')).toBeInTheDocument();
        expect(purchaseRequests).toBe(1);
    });

    it('stale bids do not regress a purchase and a ceiling leaves Buy Now available', async () => {
        renderAt(`/auctions/${macBook.id}`);
        await screen.findByRole('heading', { name: 'MacBook Pro' });
        livePurchased({
            auctionId: macBook.id,
            bidderId: 'buyer-b',
            finalPrice: 2000,
            auctionVersion: 12,
            purchasedAtUtc: new Date().toISOString(),
            occurredAtUtc: new Date().toISOString(),
            correlationId: 'purchase',
        });
        live({
            auctionId: macBook.id,
            bidId: 'stale-bid',
            bidderId: 'late-bidder',
            amount: 1800,
            auctionVersion: 11,
            occurredAtUtc: new Date().toISOString(),
            correlationId: 'stale',
        });
        expect(screen.queryByText('late-bidder')).not.toBeInTheDocument();

        cleanup();
        vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) => {
            const url = String(input);
            if (url.endsWith(`/api/auctions/${macBook.id}/bids`)) return json([]);
            if (url.endsWith(`/api/auctions/${macBook.id}`)) return json(auctionAndBuyNowAtCeiling);
            return json(auctions);
        });
        renderAt(`/auctions/${macBook.id}`);
        expect(
            await screen.findByRole('button', { name: 'Bidding ceiling reached' }),
        ).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Buy Now' })).toBeEnabled();
    });

    it('REST-loaded Closed auction starts with bidding disabled', async () => {
        const closedAuction: AuctionDetail = {
            ...macBook,
            status: 'Closed',
            endTimeUtc: new Date(Date.now() - 10_000).toISOString(),
            currentBidderId: 'erin',
            currentBidAmount: 1500,
        };
        vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) => {
            const url = String(input);
            if (url.endsWith(`/api/auctions/${macBook.id}/bids`)) return json(bids);
            if (url.endsWith(`/api/auctions/${macBook.id}`)) return json(closedAuction);
            return json(auctions);
        });

        renderAt(`/auctions/${macBook.id}`);

        expect(await screen.findByText('Final bid $1,500')).toBeInTheDocument();
        expect(screen.getAllByText('Winner: erin').length).toBeGreaterThan(0);
        expect(screen.getByRole('button', { name: 'Auction closed' })).toBeDisabled();
        expect(screen.getAllByText('Closed').length).toBeGreaterThan(0);
        expect(screen.queryByText('Next minimum')).not.toBeInTheDocument();
    });

    it('Live Feed outage does not prevent REST Closed state from rendering', async () => {
        const closedAuction: AuctionDetail = {
            ...macBook,
            status: 'Closed',
            endTimeUtc: new Date(Date.now() - 10_000).toISOString(),
            currentBidderId: null,
            currentBidAmount: null,
        };
        vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) => {
            const url = String(input);
            if (url.endsWith(`/api/auctions/${macBook.id}/bids`)) return json([]);
            if (url.endsWith(`/api/auctions/${macBook.id}`)) return json(closedAuction);
            return json(auctions);
        });

        renderAt(`/auctions/${macBook.id}`);
        socketHandlers.get('connect_error')?.();

        expect((await screen.findAllByText('Offline')).length).toBeGreaterThan(0);
        expect(screen.getByText('No bids were placed.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Auction closed' })).toBeDisabled();
    });
    it('API unavailable state renders cleanly', async () => {
        vi.mocked(fetch).mockRejectedValue(new Error('network down'));
        renderAt('/auctions');

        expect(await screen.findByText('Bidding API unavailable')).toBeInTheDocument();
    });
});
