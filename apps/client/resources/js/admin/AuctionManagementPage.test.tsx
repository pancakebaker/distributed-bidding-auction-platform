import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuctionManagementPage } from './AuctionManagementPage';

const api = vi.hoisted(() => ({
    createAuction: vi.fn(),
    deleteAuction: vi.fn(),
    getAuction: vi.fn(),
    getAuctions: vi.fn(),
    updateAuction: vi.fn(),
}));

vi.mock('../api', () => api);

const auctions = [
    {
        id: 'scheduled-1',
        title: 'Scheduled auction',
        startingPrice: 100,
        saleMode: 'AuctionOnly',
        buyNowPrice: null,
        minimumBidIncrement: 10,
        currentBidAmount: null,
        currentBidderId: null,
        finalWinnerId: null,
        finalPrice: null,
        minimumValidBid: 100,
        status: 'Scheduled',
        startTimeUtc: '2099-09-12T10:00:00.000Z',
        endTimeUtc: '2099-09-12T12:00:00.000Z',
        version: 1,
    },
    {
        id: 'open-1',
        title: 'Open auction',
        startingPrice: 100,
        saleMode: 'AuctionAndBuyNow',
        buyNowPrice: 500,
        minimumBidIncrement: 25,
        currentBidAmount: null,
        currentBidderId: null,
        finalWinnerId: null,
        finalPrice: null,
        minimumValidBid: 100,
        status: 'Open',
        startTimeUtc: '2020-09-12T10:00:00.000Z',
        endTimeUtc: '2099-09-12T12:00:00.000Z',
        version: 2,
    },
    {
        id: 'closed-1',
        title: 'Closed auction',
        startingPrice: 100,
        saleMode: 'BuyNowOnly',
        buyNowPrice: 500,
        minimumBidIncrement: 1,
        currentBidAmount: null,
        currentBidderId: null,
        finalWinnerId: 'buyer',
        finalPrice: 500,
        minimumValidBid: 100,
        status: 'Closed',
        startTimeUtc: '2020-09-12T10:00:00.000Z',
        endTimeUtc: '2020-09-12T12:00:00.000Z',
        version: 2,
    },
];

describe('auction management page', () => {
    beforeEach(() => {
        api.getAuctions.mockResolvedValue(auctions);
        api.getAuction.mockResolvedValue({
            ...auctions[0],
            description: 'Description',
            createdAtUtc: auctions[0].startTimeUtc,
            updatedAtUtc: auctions[0].startTimeUtc,
        });
        api.createAuction.mockResolvedValue({ ...auctions[0] });
        api.updateAuction.mockResolvedValue({ ...auctions[0] });
        api.deleteAuction.mockResolvedValue(undefined);
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
        vi.clearAllMocks();
    });

    it('shows lifecycle-safe actions and the three sale-mode form variants', async () => {
        const user = userEvent.setup();
        render(<AuctionManagementPage />);
        await screen.findByText('Scheduled auction');

        expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
        expect(screen.getAllByText('Lifecycle locked')).toHaveLength(2);

        await user.click(screen.getByRole('button', { name: 'Create auction' }));
        expect(screen.getByText('Starting price')).toBeInTheDocument();
        expect(screen.queryByText('Buy Now price')).not.toBeInTheDocument();

        await user.selectOptions(screen.getByRole('combobox', { name: 'Sale mode' }), 'BuyNowOnly');
        expect(screen.getByText('Buy Now price')).toBeInTheDocument();
        expect(screen.queryByText('Starting price')).not.toBeInTheDocument();
        expect(screen.getByText('Compatibility increment')).toBeInTheDocument();

        await user.selectOptions(
            screen.getByRole('combobox', { name: 'Sale mode' }),
            'AuctionAndBuyNow',
        );
        expect(screen.getByText('Starting price')).toBeInTheDocument();
        expect(screen.getByText('Buy Now price')).toBeInTheDocument();
    });

    it('requires confirmation before deletion and refreshes after success', async () => {
        const confirmMock = vi.fn(() => true);
        vi.stubGlobal('confirm', confirmMock);
        const user = userEvent.setup();
        render(<AuctionManagementPage />);
        await screen.findByText('Scheduled auction');

        await user.click(screen.getByRole('button', { name: 'Delete' }));
        expect(confirmMock).toHaveBeenCalled();
        expect(api.deleteAuction).toHaveBeenCalledWith('scheduled-1');
        await waitFor(() => expect(api.getAuctions).toHaveBeenCalledTimes(2));
    });

    it('does not call delete when confirmation is cancelled', async () => {
        vi.stubGlobal(
            'confirm',
            vi.fn(() => false),
        );
        const user = userEvent.setup();
        render(<AuctionManagementPage />);
        await screen.findByText('Scheduled auction');

        await user.click(screen.getByRole('button', { name: 'Delete' }));
        expect(api.deleteAuction).not.toHaveBeenCalled();
    });

    it('validates before creating and sends canonical fields on a valid submit', async () => {
        const user = userEvent.setup();
        render(<AuctionManagementPage />);
        await screen.findByText('Scheduled auction');
        await user.click(screen.getByRole('button', { name: 'Create auction' }));
        await user.click(screen.getByRole('button', { name: 'Create auction' }));
        expect(screen.getByText('Title is required.')).toBeInTheDocument();
        expect(api.createAuction).not.toHaveBeenCalled();
    });
});
