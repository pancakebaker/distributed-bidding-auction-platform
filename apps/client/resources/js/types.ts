export type AuctionSummary = {
    id: string;
    title: string;
    startingPrice: number;
    minimumBidIncrement: number;
    currentBidAmount: number | null;
    currentBidderId: string | null;
    minimumValidBid: number;
    status: string;
    startTimeUtc: string;
    endTimeUtc: string;
    version: number;
};

export type AuctionDetail = AuctionSummary & {
    description: string;
    createdAtUtc: string;
    updatedAtUtc: string;
};

export type Bid = {
    id: string;
    auctionId: string;
    bidderId: string;
    amount: number;
    createdAtUtc: string;
};

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

export type ApiErrorResponse = {
    code: string;
    message: string;
    details?: {
        currentBidAmount?: number | null;
        minimumValidBid?: number;
        auctionVersion?: number;
    } | null;
};

export type LiveBidAccepted = {
    auctionId: string;
    bidId: string;
    bidderId: string;
    amount: number;
    auctionVersion: number;
    occurredAtUtc: string;
    correlationId: string | null;
};

export type LiveStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline';
