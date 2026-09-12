import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAuction, deleteAuction, updateAuction } from '../api';

const payload = {
    title: 'Test auction',
    description: 'Test description',
    saleMode: 'AuctionOnly' as const,
    startingPrice: 100,
    minimumBidIncrement: 10,
    buyNowPrice: null,
    startTimeUtc: '2026-09-12T10:00:00.000Z',
    endTimeUtc: '2026-09-12T12:00:00.000Z',
};

describe('auction management API client', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('creates with only configurable fields', async () => {
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValue(new Response(JSON.stringify({ id: 'auction-1' }), { status: 201 }));
        vi.stubGlobal('fetch', fetchMock);

        await createAuction(payload);

        const calls = fetchMock.mock.calls as Array<[string, RequestInit | undefined]>;
        const init = calls[0][1];
        if (!init) {
            throw new Error('Expected create request init.');
        }
        expect(init.method).toBe('POST');
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        expect(body).toEqual(payload);
        expect(body).not.toHaveProperty('version');
        expect(body).not.toHaveProperty('status');
        expect(body).not.toHaveProperty('finalPrice');
    });

    it('updates with the expected version and deletes through the management routes', async () => {
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(
                new Response(JSON.stringify({ id: 'auction-1' }), { status: 200 }),
            )
            .mockResolvedValueOnce(new Response(null, { status: 204 }));
        vi.stubGlobal('fetch', fetchMock);

        await updateAuction('auction-1', { ...payload, version: 4 });
        await deleteAuction('auction-1');

        const calls = fetchMock.mock.calls as Array<[string, RequestInit | undefined]>;
        expect(calls[0][0]).toContain('/api/auctions/auction-1');
        expect((JSON.parse(String(calls[0][1]?.body)) as { version: number }).version).toBe(4);
        expect(calls[1][0]).toContain('/api/auctions/auction-1');
        expect(calls[1][1]?.method).toBe('DELETE');
    });

    it('preserves structured API errors', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                new Response(JSON.stringify({ code: 'auction_not_deletable', message: 'locked' }), {
                    status: 409,
                }),
            ),
        );

        await expect(deleteAuction('auction-1')).rejects.toMatchObject({
            status: 409,
            error: { code: 'auction_not_deletable' },
        });
    });
});
