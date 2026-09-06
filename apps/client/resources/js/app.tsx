import '../css/app.css';

import React, { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { ApiClientError, getAuction, getAuctionBids, getAuctions, placeBid } from './api';
import { connectAuctionFeed } from './liveFeed';
import type { ApiErrorResponse, AuctionDetail, AuctionSummary, Bid, LiveAuctionClosed, LiveStatus } from './types';

const bidders = ['Alice', 'Bob', 'Charlie', 'Diana'];

type WinnerState = {
    winnerId: string;
    winningBidId?: string;
    amount: number;
    selectedAtUtc?: string;
    auctionVersion: number;
};

function formatMoney(value: number | null | undefined) {
    if (value === null || value === undefined) {
        return 'No bids yet';
    }

    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
    }).format(value);
}

function formatDate(value: string) {
    return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    }).format(new Date(value));
}

function statusTone(status: string) {
    if (status === 'Open') return 'status-open';
    if (status === 'Scheduled') return 'status-scheduled';
    return 'status-muted';
}

function getCountdown(auction: Pick<AuctionSummary, 'status' | 'startTimeUtc' | 'endTimeUtc'>, now: number) {
    const starts = new Date(auction.startTimeUtc).getTime();
    const ends = new Date(auction.endTimeUtc).getTime();

    if (auction.status === 'Closed' || auction.status === 'Cancelled' || now >= ends) {
        return 'Closed';
    }

    if (now < starts) {
        return `Starts in ${duration(starts - now)}`;
    }

    return `Ends in ${duration(ends - now)}`;
}

function duration(ms: number) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return [hours, minutes, seconds].map((part) => part.toString().padStart(2, '0')).join(':');
}

function useNow() {
    const [now, setNow] = useState(Date.now());

    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, []);

    return now;
}

function navigateTo(path: string) {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
}

function usePath() {
    const [path, setPath] = useState(window.location.pathname);

    useEffect(() => {
        const listener = () => setPath(window.location.pathname);
        window.addEventListener('popstate', listener);
        return () => window.removeEventListener('popstate', listener);
    }, []);

    return path;
}

export function App() {
    const path = usePath();
    const auctionMatch = path.match(/^\/auctions\/([^/]+)$/);

    if (auctionMatch) {
        return <AuctionDetailPage auctionId={auctionMatch[1]} />;
    }

    return <AuctionListPage />;
}

function Shell({ children }: { children: React.ReactNode }) {
    return (
        <main className="app-shell">
            <header className="topbar">
                <button className="brand" onClick={() => navigateTo('/auctions')} type="button">
                    Distributed Bidding Auction Platform
                </button>
                <span className="demo-badge">Functional demo</span>
            </header>
            {children}
        </main>
    );
}

function AuctionListPage() {
    const [auctions, setAuctions] = useState<AuctionSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const now = useNow();

    useEffect(() => {
        getAuctions()
            .then((items) => {
                setAuctions(items);
                setError(null);
            })
            .catch((caught) => setError(caught instanceof Error ? caught.message : 'Unable to load auctions.'))
            .finally(() => setLoading(false));
    }, []);

    return (
        <Shell>
            <section className="page-heading">
                <p className="eyebrow">Auction discovery</p>
                <h1>Live bidding demo</h1>
                <p>
                    Browse seeded auctions, place bids through the authoritative .NET API, and watch accepted bids fan
                    out in real time.
                </p>
            </section>

            {loading && (
                <StateMessage title="Loading auctions" message="Fetching current auction state from the Bidding API." />
            )}
            {error && <StateMessage title="Bidding API unavailable" message={error} tone="error" />}

            <section className="auction-grid" aria-label="Auction list">
                {auctions.map((auction) => (
                    <article className="auction-card" key={auction.id}>
                        <div className="card-row">
                            <span className={`status-pill ${statusTone(auction.status)}`}>{auction.status}</span>
                            <span className="countdown">{getCountdown(auction, now)}</span>
                        </div>
                        <h2>{auction.title}</h2>
                        <dl className="metric-list">
                            <div>
                                <dt>Current bid</dt>
                                <dd>{formatMoney(auction.currentBidAmount ?? auction.startingPrice)}</dd>
                            </div>
                            <div>
                                <dt>Minimum increment</dt>
                                <dd>{formatMoney(auction.minimumBidIncrement)}</dd>
                            </div>
                            <div>
                                <dt>Window</dt>
                                <dd>
                                    {formatDate(auction.startTimeUtc)} - {formatDate(auction.endTimeUtc)}
                                </dd>
                            </div>
                        </dl>
                        <button
                            className="primary-button"
                            onClick={() => navigateTo(`/auctions/${auction.id}`)}
                            type="button"
                        >
                            View auction
                        </button>
                    </article>
                ))}
            </section>
        </Shell>
    );
}

function AuctionDetailPage({ auctionId }: { auctionId: string }) {
    const [auction, setAuction] = useState<AuctionDetail | null>(null);
    const [bids, setBids] = useState<Bid[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [bidderId, setBidderId] = useState(bidders[0]);
    const [amount, setAmount] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [formMessage, setFormMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
    const [liveStatus, setLiveStatus] = useState<LiveStatus>('connecting');
    const [activity, setActivity] = useState<string[]>([]);
    const [winner, setWinner] = useState<WinnerState | null>(null);
    const now = useNow();

    const refresh = () => {
        setLoading(true);
        Promise.all([getAuction(auctionId), getAuctionBids(auctionId)])
            .then(([auctionResponse, bidResponse]) => {
                setAuction(auctionResponse);
                setBids(bidResponse);
                setLoadError(null);
                setAmount(String(auctionResponse.minimumValidBid));
                setWinner(
                    auctionResponse.status === 'Closed' &&
                        auctionResponse.currentBidderId &&
                        auctionResponse.currentBidAmount !== null
                        ? {
                              winnerId: auctionResponse.currentBidderId,
                              amount: auctionResponse.currentBidAmount,
                              auctionVersion: auctionResponse.version,
                          }
                        : null,
                );
            })
            .catch((caught) => setLoadError(caught instanceof Error ? caught.message : 'Unable to load auction.'))
            .finally(() => setLoading(false));
    };

    useEffect(refresh, [auctionId]);

    useEffect(() => {
        const socket = connectAuctionFeed(auctionId, {
            onStatus: setLiveStatus,
            onBidAccepted: (event) => {
                if (event.auctionId !== auctionId) {
                    return;
                }

                setAuction((current) => {
                    if (!current || event.auctionVersion <= current.version) {
                        return current;
                    }

                    const nextMinimumBid = event.amount + current.minimumBidIncrement;
                    setAmount(String(nextMinimumBid));

                    return {
                        ...current,
                        currentBidAmount: event.amount,
                        currentBidderId: event.bidderId,
                        minimumValidBid: nextMinimumBid,
                        version: event.auctionVersion,
                        updatedAtUtc: event.occurredAtUtc,
                    };
                });

                setBids((current) => {
                    if (current.some((bid) => bid.id === event.bidId)) {
                        return current;
                    }

                    return [
                        {
                            id: event.bidId,
                            auctionId: event.auctionId,
                            bidderId: event.bidderId,
                            amount: event.amount,
                            createdAtUtc: event.occurredAtUtc,
                        },
                        ...current,
                    ];
                });

                setActivity((current) =>
                    [`${event.bidderId} bid ${formatMoney(event.amount)}`, ...current].slice(0, 4),
                );
            },
            onAuctionClosed: (event) => {
                if (event.auctionId !== auctionId) {
                    return;
                }

                setAuction((current) => applyAuctionClosed(current, event));
                setFormMessage({ tone: 'error', text: 'This auction is now closed.' });
                setActivity((current) => ['Auction closed', ...current].slice(0, 4));
            },
            onWinnerSelected: (event) => {
                if (event.auctionId !== auctionId) {
                    return;
                }

                setAuction((current) => {
                    if (!current || event.auctionVersion < current.version) {
                        return current;
                    }

                    return {
                        ...current,
                        currentBidAmount: event.amount,
                        currentBidderId: event.winnerId,
                        status: 'Closed',
                        minimumValidBid: event.amount + current.minimumBidIncrement,
                        version: Math.max(current.version, event.auctionVersion),
                        updatedAtUtc: event.selectedAtUtc,
                    };
                });
                setWinner((current) => {
                    if (current && event.auctionVersion < current.auctionVersion) {
                        return current;
                    }

                    return {
                        winnerId: event.winnerId,
                        winningBidId: event.winningBidId,
                        amount: event.amount,
                        selectedAtUtc: event.selectedAtUtc,
                        auctionVersion: event.auctionVersion,
                    };
                });
                setActivity((current) => [`Winner selected: ${event.winnerId}`, ...current].slice(0, 4));
            },
        });

        return () => {
            socket.disconnect();
        };
    }, [auctionId]);

    const minimumBid = auction?.minimumValidBid ?? 0;
    const countdown = auction ? getCountdown(auction, now) : '';
    const biddingUnavailable = !auction || auction.status !== 'Open' || countdown === 'Closed';
    const displayedWinner =
        winner ??
        (auction?.status === 'Closed' && auction.currentBidderId && auction.currentBidAmount !== null
            ? { winnerId: auction.currentBidderId, amount: auction.currentBidAmount, auctionVersion: auction.version }
            : null);

    async function onSubmit(event: FormEvent) {
        event.preventDefault();

        if (!auction || biddingUnavailable) {
            setFormMessage({ tone: 'error', text: 'This auction is not accepting bids right now.' });
            return;
        }

        const numericAmount = Number(amount);
        if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
            setFormMessage({ tone: 'error', text: 'Enter a positive bid amount.' });
            return;
        }

        setSubmitting(true);
        setFormMessage(null);

        try {
            const response = await placeBid(auction.id, bidderId, numericAmount);
            setAuction({
                ...auction,
                currentBidAmount: response.currentBidAmount,
                currentBidderId: response.currentBidderId,
                minimumValidBid: response.nextMinimumBid,
                version: response.auctionVersion,
                updatedAtUtc: response.createdAtUtc,
            });
            setBids((current) => [
                {
                    id: response.bidId,
                    auctionId: response.auctionId,
                    bidderId: response.bidderId,
                    amount: response.amount,
                    createdAtUtc: response.createdAtUtc,
                },
                ...current.filter((bid) => bid.id !== response.bidId),
            ]);
            setAmount(String(response.nextMinimumBid));
            setFormMessage({ tone: 'success', text: 'Your bid was accepted.' });
        } catch (caught) {
            const apiError = caught instanceof ApiClientError ? caught.error : null;
            setFormMessage({ tone: 'error', text: describeBidError(apiError, caught) });

            if (apiError?.details?.minimumValidBid !== undefined || apiError?.code === 'auction_concurrency_conflict') {
                refresh();
            }
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <Shell>
            <button className="back-button" onClick={() => navigateTo('/auctions')} type="button">
                Back to auctions
            </button>

            {loading && (
                <StateMessage title="Loading auction" message="Fetching auction detail and accepted bid history." />
            )}
            {loadError && <StateMessage title="Auction unavailable" message={loadError} tone="error" />}

            {auction && (
                <section className="detail-layout">
                    <article className="detail-main">
                        <div className="card-row">
                            <span className={`status-pill ${statusTone(auction.status)}`}>{auction.status}</span>
                            <LiveIndicator status={liveStatus} />
                        </div>
                        <h1>{auction.title}</h1>
                        <p className="description">{auction.description}</p>

                        <div className="price-panel">
                            <span>{auction.status === 'Closed' ? 'Final bid' : 'Current bid'}</span>
                            <strong>{formatMoney(auction.currentBidAmount ?? auction.startingPrice)}</strong>
                            <small>
                                {auction.currentBidderId
                                    ? `${auction.status === 'Closed' ? 'Winner' : 'Highest bidder'}: ${auction.currentBidderId}`
                                    : 'No accepted bidder yet'}
                            </small>
                        </div>

                        {auction.status === 'Closed' && (
                            <section className="closed-panel" aria-label="Auction closed summary">
                                <span>Auction closed</span>
                                <strong>
                                    {auction.currentBidAmount === null
                                        ? 'No bids were placed.'
                                        : `Final bid ${formatMoney(auction.currentBidAmount)}`}
                                </strong>
                                {displayedWinner ? (
                                    <p>
                                        {displayedWinner.winnerId.toLowerCase() === bidderId.toLowerCase()
                                            ? 'You won this auction.'
                                            : `Winner: ${displayedWinner.winnerId}`}
                                    </p>
                                ) : (
                                    <p>No winner was selected.</p>
                                )}
                            </section>
                        )}

                        <dl className="detail-metrics">
                            {auction.status !== 'Closed' && (
                                <div>
                                    <dt>Next minimum</dt>
                                    <dd>{formatMoney(minimumBid)}</dd>
                                </div>
                            )}
                            <div>
                                <dt>Version</dt>
                                <dd>{auction.version}</dd>
                            </div>
                            <div>
                                <dt>Timing</dt>
                                <dd>{countdown}</dd>
                            </div>
                            <div>
                                <dt>Starts</dt>
                                <dd>{formatDate(auction.startTimeUtc)}</dd>
                            </div>
                            <div>
                                <dt>Ends</dt>
                                <dd>{formatDate(auction.endTimeUtc)}</dd>
                            </div>
                        </dl>

                        <section className="bid-history">
                            <h2>Bid history</h2>
                            {bids.length === 0 ? (
                                <p className="muted">No accepted bids yet.</p>
                            ) : (
                                <ul>
                                    {bids.map((bid) => (
                                        <li key={bid.id}>
                                            <span>{bid.bidderId}</span>
                                            <strong>{formatMoney(bid.amount)}</strong>
                                            <time>{formatDate(bid.createdAtUtc)}</time>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                    </article>

                    <aside className="bid-sidepanel">
                        <form onSubmit={onSubmit}>
                            <h2>{biddingUnavailable ? 'Auction closed' : 'Place bid'}</h2>
                            <label>
                                Acting as
                                <select
                                    disabled={biddingUnavailable}
                                    value={bidderId}
                                    onChange={(event) => setBidderId(event.target.value)}
                                >
                                    {bidders.map((bidder) => (
                                        <option key={bidder} value={bidder.toLowerCase()}>
                                            {bidder}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label>
                                Bid amount
                                <input
                                    min="1"
                                    step="1"
                                    inputMode="decimal"
                                    value={biddingUnavailable ? '' : amount}
                                    placeholder={biddingUnavailable ? 'Bidding closed' : undefined}
                                    disabled={biddingUnavailable}
                                    onChange={(event) => setAmount(event.target.value)}
                                />
                            </label>
                            <button
                                className="primary-button"
                                disabled={submitting || biddingUnavailable}
                                type="submit"
                            >
                                {biddingUnavailable ? 'Auction closed' : submitting ? 'Placing bid...' : 'Place bid'}
                            </button>
                            {formMessage && <p className={`form-message ${formMessage.tone}`}>{formMessage.text}</p>}
                        </form>

                        <section className="system-panel">
                            <h2>Demo status</h2>
                            <div className="system-row">
                                <span>Bidding API</span>
                                <strong>{loadError ? 'Unavailable' : 'Connected'}</strong>
                            </div>
                            <div className="system-row">
                                <span>Live Feed</span>
                                <strong>{formatLiveStatus(liveStatus)}</strong>
                            </div>
                            <div className="system-row">
                                <span>Auction Version</span>
                                <strong>{auction.version}</strong>
                            </div>
                            <h3>Recent live activity</h3>
                            {activity.length === 0 ? (
                                <p className="muted">No live events in this tab yet.</p>
                            ) : (
                                <ul className="activity-list">
                                    {activity.map((item, index) => (
                                        <li key={`${item}-${index}`}>{item}</li>
                                    ))}
                                </ul>
                            )}
                        </section>
                    </aside>
                </section>
            )}
        </Shell>
    );
}

function applyAuctionClosed(current: AuctionDetail | null, event: LiveAuctionClosed): AuctionDetail | null {
    if (!current || event.auctionVersion < current.version) {
        return current;
    }

    return {
        ...current,
        currentBidAmount: event.finalBidAmount,
        currentBidderId: event.finalBidderId,
        minimumValidBid:
            event.finalBidAmount === null
                ? current.minimumValidBid
                : event.finalBidAmount + current.minimumBidIncrement,
        status: 'Closed',
        version: Math.max(current.version, event.auctionVersion),
        updatedAtUtc: event.closedAtUtc,
    };
}
function describeBidError(apiError: ApiErrorResponse | null, caught: unknown) {
    if (!apiError) {
        return caught instanceof Error ? caught.message : 'Bid submission failed.';
    }

    if (apiError.code === 'bid_below_minimum' && apiError.details?.minimumValidBid !== undefined) {
        return `Bid is below the current minimum of ${formatMoney(apiError.details.minimumValidBid)}.`;
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

    return apiError.message;
}

function formatLiveStatus(status: LiveStatus) {
    if (status === 'connected') return 'Connected';
    if (status === 'reconnecting') return 'Reconnecting';
    if (status === 'connecting') return 'Connecting';
    return 'Offline';
}

function LiveIndicator({ status }: { status: LiveStatus }) {
    const label = useMemo(() => {
        const formatted = formatLiveStatus(status);
        return status === 'connected' ? `Live ${formatted.toLowerCase()}` : formatted;
    }, [status]);

    return <span className={`live-indicator live-${status}`}>{label}</span>;
}

function StateMessage({
    title,
    message,
    tone = 'neutral',
}: {
    title: string;
    message: string;
    tone?: 'neutral' | 'error';
}) {
    return (
        <section className={`state-message ${tone}`}>
            <h2>{title}</h2>
            <p>{message}</p>
        </section>
    );
}

const root = document.getElementById('app');

if (root) {
    createRoot(root).render(<App />);
}
