/**
 * Shared browser-side contracts for Bidding API responses and live-feed Socket.IO events.
 */
/**
 * Auction summary returned by the Bidding API for list and card views.
 */
export type AuctionSummary = {
    id: string;
    title: string;
    startingPrice: number;
    saleMode: SaleMode;
    buyNowPrice: number | null;
    minimumBidIncrement: number;
    currentBidAmount: number | null;
    currentBidderId: string | null;
    finalWinnerId: string | null;
    finalPrice: number | null;
    minimumValidBid: number;
    status: string;
    startTimeUtc: string;
    endTimeUtc: string;
    version: number;
};

export type SaleMode = 'AuctionOnly' | 'BuyNowOnly' | 'AuctionAndBuyNow';

/**
 * Detailed auction state used by the bidding screen and REST reconciliation after
 * missed live events.
 */
export type AuctionDetail = AuctionSummary & {
    description: string;
    createdAtUtc: string;
    updatedAtUtc: string;
};

/**
 * Accepted bid history item returned by the Bidding API.
 */
export type Bid = {
    id: string;
    auctionId: string;
    bidderId: string;
    amount: number;
    createdAtUtc: string;
};

/**
 * Successful bid command response containing the authoritative next auction state.
 */
export type PlaceBidResponse = {
    bidId: string;
    auctionId: string;
    bidderId: string;
    amount: number;
    currentBidAmount: number;
    currentBidderId: string;
    nextMinimumBid: number;
    auctionVersion: number;
    createdAtUtc: string;
    correlationId: string;
};

export type BuyNowResponse = {
    auctionId: string;
    bidderId: string;
    finalPrice: number;
    auctionVersion: number;
    purchasedAtUtc: string;
    correlationId: string;
};

/**
 * Structured Bidding API error payload surfaced as user-friendly bid feedback.
 */
export type ApiErrorResponse = {
    code: string;
    message: string;
    details?: {
        currentBidAmount?: number | null;
        minimumValidBid?: number;
        auctionVersion?: number;
        buyNowPrice?: number | null;
    } | null;
};

/**
 * Socket.IO event payload broadcast when another accepted bid changes auction state.
 */
export type LiveBidAccepted = {
    auctionId: string;
    bidId: string;
    bidderId: string;
    amount: number;
    auctionVersion: number;
    occurredAtUtc: string;
    correlationId: string | null;
};

/**
 * Connection state displayed by the auction detail live indicator.
 */
export type LiveStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline';
/**
 * Socket.IO event payload broadcast when the scheduler closes an auction.
 */
export type LiveAuctionClosed = {
    auctionId: string;
    closedAtUtc: string;
    finalBidAmount: number | null;
    finalBidderId: string | null;
    auctionVersion: number;
    correlationId: string | null;
};

/**
 * Socket.IO event payload broadcast when the scheduler selects a winning bidder.
 */
export type LiveWinnerSelected = {
    auctionId: string;
    winningBidId: string;
    winnerId: string;
    amount: number;
    selectedAtUtc: string;
    auctionVersion: number;
    correlationId: string | null;
};

export type LiveAuctionPurchased = {
    auctionId: string;
    bidderId: string;
    finalPrice: number;
    auctionVersion: number;
    purchasedAtUtc: string;
    occurredAtUtc: string;
    correlationId: string | null;
};
