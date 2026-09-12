/**
 * Client-only validation and timezone helpers for auction management forms.
 */
import type { AuctionDetail, AuctionSummary, SaleMode } from '../types';

/** Converts a UTC API timestamp into a value accepted by datetime-local inputs. */
export function utcToLocalInput(value: string) {
    const date = new Date(value);
    const offset = date.getTimezoneOffset() * 60_000;

    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

/** Converts a datetime-local value into an explicit UTC API timestamp. */
export function localInputToUtc(value: string) {
    return new Date(value).toISOString();
}

/** Returns whether the current list state looks safe to edit. */
export function appearsEditable(
    auction:
        | Pick<
              AuctionDetail | AuctionSummary,
              | 'status'
              | 'startTimeUtc'
              | 'currentBidAmount'
              | 'currentBidderId'
              | 'finalWinnerId'
              | 'finalPrice'
          >
        | null
        | undefined,
    now = Date.now(),
) {
    return Boolean(
        auction &&
        auction.status === 'Scheduled' &&
        new Date(auction.startTimeUtc).getTime() > now &&
        auction.currentBidAmount === null &&
        auction.currentBidderId === null &&
        auction.finalWinnerId === null &&
        auction.finalPrice === null,
    );
}

/** Returns whether the current list state appears cancellable. */
export function appearsCancellable(
    auction:
        | Pick<
              AuctionDetail | AuctionSummary,
              'status' | 'currentBidAmount' | 'currentBidderId' | 'finalWinnerId' | 'finalPrice'
          >
        | null
        | undefined,
) {
    return Boolean(
        auction &&
        (auction.status === 'Scheduled' || auction.status === 'Open') &&
        auction.finalWinnerId === null &&
        auction.finalPrice === null,
    );
}

/** Converts stable management API errors into actionable admin copy. */
export function describeManagementError(code: string | undefined, fallback: string) {
    switch (code) {
        case 'auction_concurrency_conflict':
            return 'This auction changed while you were editing. The latest state has been loaded; review and submit again.';
        case 'auction_already_started':
        case 'auction_not_editable':
            return 'Only an untouched future Scheduled auction can be edited.';
        case 'auction_not_deletable':
            return 'This auction cannot be permanently deleted because it has started, history, or terminal state.';
        case 'auction_already_cancelled':
            return 'This auction is already cancelled.';
        case 'auction_not_cancellable':
            return 'Closed or purchased auctions cannot be cancelled.';
        case 'invalid_auction_time_window':
            return 'Choose a future end time after the start time.';
        case 'invalid_buy_now_price':
            return 'Enter a valid Buy Now price greater than the starting price when required.';
        case 'invalid_starting_price':
            return 'Enter a starting price greater than zero.';
        case 'invalid_bid_increment':
            return 'Enter a minimum bid increment greater than zero.';
        case 'invalid_sale_mode_configuration':
            return 'The sale mode and prices do not form a valid auction configuration.';
        case 'auction_not_found':
            return 'The auction no longer exists. The list has been refreshed.';
        default:
            return fallback;
    }
}

/** Performs UX-only validation before a management request reaches the server. */
export function validateAuctionForm(form: AuctionFormState) {
    const errors: Record<string, string> = {};
    const start = new Date(form.startTimeLocal).getTime();
    const end = new Date(form.endTimeLocal).getTime();

    if (!form.title.trim()) errors.title = 'Title is required.';
    if (!form.description.trim()) errors.description = 'Description is required.';
    if (!Number.isFinite(form.startingPrice) || form.startingPrice <= 0) {
        errors.startingPrice = 'Starting price must be greater than zero.';
    }
    if (!Number.isFinite(form.minimumBidIncrement) || form.minimumBidIncrement <= 0) {
        errors.minimumBidIncrement = 'Minimum bid increment must be greater than zero.';
    }
    if (form.saleMode !== 'AuctionOnly' && (!form.buyNowPrice || form.buyNowPrice <= 0)) {
        errors.buyNowPrice = 'Buy Now price must be greater than zero.';
    }
    if (
        form.saleMode === 'AuctionAndBuyNow' &&
        form.buyNowPrice !== null &&
        form.buyNowPrice <= form.startingPrice
    ) {
        errors.buyNowPrice = 'Buy Now price must be greater than starting price.';
    }
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
        errors.endTimeLocal = 'End time must be after start time.';
    }

    return errors;
}

/** Editable client-side form state; server-owned auction state is intentionally absent. */
export type AuctionFormState = {
    id?: string;
    title: string;
    description: string;
    saleMode: SaleMode;
    startingPrice: number;
    minimumBidIncrement: number;
    buyNowPrice: number | null;
    startTimeLocal: string;
    endTimeLocal: string;
    version?: number;
};
