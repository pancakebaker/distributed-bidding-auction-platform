/**
 * Auction display, lifecycle, and bid-error helpers shared by public auction pages.
 */
import type {
    ApiErrorResponse,
    AuctionDetail,
    AuctionSummary,
    LiveAuctionClosed,
    LiveAuctionPurchased,
    LiveStatus,
} from '../../types';

/**
 * Formats auction currency values for display.
 */
export function formatMoney(value: number | null | undefined) {
    if (value === null || value === undefined) {
        return 'No bids yet';
    }

    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
    }).format(value);
}

/**
 * Formats auction timestamps for display.
 */
export function formatDate(value: string) {
    return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    }).format(new Date(value));
}

/**
 * Maps auction status values to presentation classes.
 */
export function statusTone(status: string) {
    if (status === 'Open') return 'status-open';
    if (status === 'Scheduled') return 'status-scheduled';
    return 'status-muted';
}

/**
 * Derives the current auction countdown label.
 */
export function getCountdown(
    auction: Pick<AuctionSummary, 'status' | 'startTimeUtc' | 'endTimeUtc'>,
    now: number,
) {
    const starts = new Date(auction.startTimeUtc).getTime();
    const ends = new Date(auction.endTimeUtc).getTime();

    if (auction.status === 'Closed' || auction.status === 'Cancelled' || now >= ends) {
        return 'Closed';
    }

    if (now < starts) {
        return 'Starts in ' + duration(starts - now);
    }

    return 'Ends in ' + duration(ends - now);
}

function duration(ms: number) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return [hours, minutes, seconds].map((part) => part.toString().padStart(2, '0')).join(':');
}

/**
 * Applies a non-stale auction closure event to detail state.
 */
export function applyAuctionClosed(
    current: AuctionDetail | null,
    event: LiveAuctionClosed,
): AuctionDetail | null {
    if (!current || event.auctionVersion < current.version) {
        return current;
    }

    return {
        ...current,
        currentBidAmount:
            current.finalPrice !== null && current.finalWinnerId !== null
                ? current.currentBidAmount
                : event.finalBidAmount,
        currentBidderId:
            current.finalPrice !== null && current.finalWinnerId !== null
                ? current.currentBidderId
                : event.finalBidderId,
        finalWinnerId:
            current.finalWinnerId ?? (event.finalBidderId !== null ? event.finalBidderId : null),
        finalPrice: current.finalPrice ?? event.finalBidAmount,
        minimumValidBid:
            event.finalBidAmount === null
                ? current.minimumValidBid
                : event.finalBidAmount + current.minimumBidIncrement,
        status: 'Closed',
        version: Math.max(current.version, event.auctionVersion),
        updatedAtUtc: event.closedAtUtc,
    };
}

/**
 * Applies an explicit purchase without converting it into ordinary bid state.
 */
export function applyAuctionPurchased(
    current: AuctionDetail | null,
    event: LiveAuctionPurchased,
): AuctionDetail | null {
    if (!current || event.auctionVersion < current.version) {
        return current;
    }

    return {
        ...current,
        status: 'Closed',
        finalWinnerId: event.bidderId,
        finalPrice: event.finalPrice,
        version: Math.max(current.version, event.auctionVersion),
        updatedAtUtc: event.purchasedAtUtc,
    };
}

/**
 * Converts bid API failures into user-facing messages.
 */
export function describeBidError(apiError: ApiErrorResponse | null, caught: unknown) {
    if (!apiError) {
        return caught instanceof Error ? caught.message : 'Bid submission failed.';
    }

    if (apiError.code === 'bid_below_minimum' && apiError.details?.minimumValidBid !== undefined) {
        return (
            'Bid is below the current minimum of ' +
            formatMoney(apiError.details.minimumValidBid) +
            '.'
        );
    }

    if (
        apiError.code === 'auction_not_open' ||
        apiError.code === 'auction_not_started' ||
        apiError.code === 'auction_ended'
    ) {
        return 'This auction is not accepting bids right now.';
    }

    if (apiError.code === 'auction_concurrency_conflict') {
        return 'Auction state changed while bidding. Refreshing latest state.';
    }

    if (apiError.code === 'bidding_not_available') {
        return 'Ordinary bidding is not available for this auction.';
    }

    if (apiError.code === 'bid_at_or_above_buy_now_price') {
        return 'Ordinary bids must be below the Buy Now price.';
    }

    return apiError.message;
}

/**
 * Converts Buy Now command failures into concise, actionable UI feedback.
 */
export function describeBuyNowError(apiError: ApiErrorResponse | null, caught: unknown) {
    if (!apiError) {
        return caught instanceof Error ? caught.message : 'Buy Now failed.';
    }

    switch (apiError.code) {
        case 'invalid_bidder':
            return 'Choose a valid buyer identity before purchasing.';
        case 'auction_not_found':
            return 'This auction is no longer available.';
        case 'auction_not_started':
            return 'Buy Now will be available when the auction starts.';
        case 'auction_ended':
            return 'This auction has ended.';
        case 'auction_not_open':
            return 'This auction is no longer open.';
        case 'buy_now_not_available':
            return 'Buy Now is no longer available for this auction.';
        case 'auction_concurrency_conflict':
            return 'Auction state changed while purchasing. Showing the latest state.';
        default:
            return apiError.message;
    }
}

/**
 * Returns whether a command response means the browser must reconcile state.
 */
export function shouldRefreshAfterConflict(code: string | undefined) {
    return new Set([
        'auction_not_open',
        'auction_not_started',
        'auction_ended',
        'buy_now_not_available',
        'auction_concurrency_conflict',
    ]).has(code ?? '');
}

/**
 * Maps live-feed status values to display labels.
 */
export function formatLiveStatus(status: LiveStatus) {
    if (status === 'connected') return 'Connected';
    if (status === 'reconnecting') return 'Reconnecting';
    if (status === 'connecting') return 'Connecting';
    return 'Offline';
}
