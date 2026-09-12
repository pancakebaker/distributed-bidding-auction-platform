/**
 * Browser-side Bidding API client used by the Laravel React auction demo.
 */
import type {
    ApiErrorResponse,
    AuctionDetail,
    AuctionSummary,
    Bid,
    BuyNowResponse,
    CreateAuctionRequest,
    UpdateAuctionRequest,
    PlaceBidResponse,
} from './types';

const biddingApiUrl = (import.meta.env.VITE_BIDDING_API_URL ?? 'http://localhost:5000').replace(
    /\/$/,
    '',
);

/**
 * Error wrapper that preserves structured Bidding API failure details for the UI.
 */
export class ApiClientError extends Error {
    public constructor(
        public readonly status: number,
        public readonly error: ApiErrorResponse,
    ) {
        super(error.message);
    }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response;

    try {
        response = await fetch(`${biddingApiUrl}${path}`, {
            headers: {
                Accept: 'application/json',
                ...init?.headers,
            },
            ...init,
        });
    } catch {
        throw new Error('Bidding API is unavailable. Check that the .NET service is running.');
    }

    const body: unknown = await response.json().catch((): null => null);

    if (!response.ok) {
        throw new ApiClientError(response.status, toApiErrorResponse(body));
    }

    return body as T;
}

function toApiErrorResponse(body: unknown): ApiErrorResponse {
    if (isApiErrorResponse(body)) {
        return body;
    }

    return { code: 'request_failed', message: 'Request failed.' };
}

function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
    return (
        typeof value === 'object' &&
        value !== null &&
        'code' in value &&
        'message' in value &&
        typeof value.code === 'string' &&
        typeof value.message === 'string'
    );
}

/**
 * Loads auction summaries for the discovery screen from the authoritative Bidding API.
 */
export function getAuctions(): Promise<AuctionSummary[]> {
    return request<AuctionSummary[]>('/api/auctions');
}

/** Creates an auction through the authoritative Bidding Service management API. */
export function createAuction(payload: CreateAuctionRequest): Promise<AuctionDetail> {
    return request<AuctionDetail>('/api/auctions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
}

/** Updates an eligible auction with its expected aggregate version. */
export function updateAuction(
    auctionId: string,
    update: UpdateAuctionRequest,
): Promise<AuctionDetail> {
    return request<AuctionDetail>(`/api/auctions/${auctionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
    });
}

/** Deletes an untouched future Scheduled auction when the server permits it. */
export function deleteAuction(auctionId: string): Promise<void> {
    return request<void>(`/api/auctions/${auctionId}`, { method: 'DELETE' });
}

/** Cancels an eligible auction using its expected aggregate version. */
export function cancelAuction(auctionId: string, version: number): Promise<AuctionDetail> {
    return request<AuctionDetail>(`/api/auctions/${auctionId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ version }),
    });
}

/**
 * Loads one auction detail record for REST reconciliation and initial page state.
 */
export function getAuction(id: string): Promise<AuctionDetail> {
    return request<AuctionDetail>(`/api/auctions/${id}`);
}

/**
 * Loads accepted bid history for an auction in the order returned by the Bidding API.
 */
export function getAuctionBids(id: string): Promise<Bid[]> {
    return request<Bid[]>(`/api/auctions/${id}/bids`);
}

/**
 * Submits a bid command with a client-generated correlation ID for tracing through
 * the demo pipeline.
 */
export function placeBid(
    auctionId: string,
    bidderId: string,
    amount: number,
): Promise<PlaceBidResponse> {
    const correlationId = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

    return request<PlaceBidResponse>(`/api/auctions/${auctionId}/bids`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Correlation-ID': correlationId,
        },
        body: JSON.stringify({ bidderId, amount }),
    });
}

/**
 * Executes the explicit Buy Now command. The server owns the authoritative price.
 */
export function buyNow(auctionId: string, bidderId: string): Promise<BuyNowResponse> {
    const correlationId = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

    return request<BuyNowResponse>(`/api/auctions/${auctionId}/buy-now`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Correlation-ID': correlationId,
        },
        body: JSON.stringify({ bidderId }),
    });
}
