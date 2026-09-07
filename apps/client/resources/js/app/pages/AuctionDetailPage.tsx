/**
 * Displays one auction, submits bids, and reconciles live-feed lifecycle events.
 */
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiClientError, getAuction, getAuctionBids, placeBid } from '../../api';
import { connectAuctionFeed } from '../../liveFeed';
import type { AuctionDetail, Bid, LiveStatus } from '../../types';
import { LiveIndicator, Shell, StateMessage } from '../components/PublicComponents';
import { useNow } from '../hooks/useNow';
import { navigateTo } from '../utils/navigation';
import {
    applyAuctionClosed,
    describeBidError,
    formatDate,
    formatLiveStatus,
    formatMoney,
    getCountdown,
    statusTone,
} from '../utils/auction';

const bidders = ['Alice', 'Bob', 'Charlie', 'Diana'];

type WinnerState = {
    winnerId: string;
    winningBidId?: string;
    amount: number;
    selectedAtUtc?: string;
    auctionVersion: number;
};
/**
 * Renders detail state, bid submission, and live auction updates.
 */
export function AuctionDetailPage({ auctionId }: { auctionId: string }) {
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
