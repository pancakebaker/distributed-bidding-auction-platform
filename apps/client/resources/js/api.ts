import type { ApiErrorResponse, AuctionDetail, AuctionSummary, Bid, PlaceBidResponse } from './types';

const biddingApiUrl = (import.meta.env.VITE_BIDDING_API_URL ?? 'http://localhost:5000').replace(/\/$/, '');

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

export function getAuctions(): Promise<AuctionSummary[]> {
    return request<AuctionSummary[]>('/api/auctions');
}

export function getAuction(id: string): Promise<AuctionDetail> {
    return request<AuctionDetail>(`/api/auctions/${id}`);
}

export function getAuctionBids(id: string): Promise<Bid[]> {
    return request<Bid[]>(`/api/auctions/${id}/bids`);
}

export function placeBid(auctionId: string, bidderId: string, amount: number): Promise<PlaceBidResponse> {
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
