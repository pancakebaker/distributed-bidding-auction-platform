import { describe, expect, it } from 'vitest';
import { localInputToUtc, utcToLocalInput, validateAuctionForm } from './auctionManagement';

const validForm = {
    title: 'Test auction',
    description: 'Description',
    saleMode: 'AuctionAndBuyNow' as const,
    startingPrice: 100,
    minimumBidIncrement: 25,
    buyNowPrice: 500,
    startTimeLocal: '2026-09-12T10:00',
    endTimeLocal: '2026-09-12T12:00',
};

describe('auction management form rules', () => {
    it('round-trips a UTC timestamp through local input conversion', () => {
        const utc = '2026-09-12T10:00:00.000Z';
        expect(localInputToUtc(utcToLocalInput(utc))).toBe(utc);
    });

    it('accepts valid configurations for all sale modes', () => {
        expect(
            Object.keys(
                validateAuctionForm({ ...validForm, saleMode: 'AuctionOnly', buyNowPrice: null }),
            ),
        ).toHaveLength(0);
        expect(
            Object.keys(validateAuctionForm({ ...validForm, saleMode: 'BuyNowOnly' })),
        ).toHaveLength(0);
        expect(Object.keys(validateAuctionForm(validForm))).toHaveLength(0);
    });

    it('rejects time, money, and Buy Now ordering errors', () => {
        const errors = validateAuctionForm({
            ...validForm,
            startingPrice: 0,
            minimumBidIncrement: 0,
            buyNowPrice: 0,
            endTimeLocal: '2026-09-12T09:00',
        });

        expect(errors.startingPrice).toBeDefined();
        expect(errors.minimumBidIncrement).toBeDefined();
        expect(errors.buyNowPrice).toBeDefined();
        expect(errors.endTimeLocal).toBeDefined();
    });
});
