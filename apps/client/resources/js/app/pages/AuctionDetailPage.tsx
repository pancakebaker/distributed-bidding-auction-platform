/**
 * Displays one auction, submits bids, and reconciles live-feed lifecycle events.
 */
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiClientError, buyNow, getAuction, getAuctionBids, placeBid } from '../../api';
import { connectAuctionFeed } from '../../liveFeed';
import type { AuctionDetail, Bid, LiveStatus } from '../../types';
import { LiveIndicator, Shell, StateMessage } from '../components/PublicComponents';
import { useNow } from '../hooks/useNow';
import { navigateTo } from '../utils/navigation';
import {
    applyAuctionClosed,
    applyAuctionCancelled,
    applyAuctionPurchased,
    describeBidError,
    describeBuyNowError,
    formatDate,
    formatLiveStatus,
    formatMoney,
    getCountdown,
    shouldRefreshAfterConflict,
    statusTone,
} from '../utils/auction';

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
    const [amount, setAmount] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [purchasing, setPurchasing] = useState(false);
    const [confirmingPurchase, setConfirmingPurchase] = useState(false);
    const [formMessage, setFormMessage] = useState<{
        tone: 'success' | 'error';
        text: string;
    } | null>(null);
    const [liveStatus, setLiveStatus] = useState<LiveStatus>('connecting');
    const [activity, setActivity] = useState<string[]>([]);
    const [winner, setWinner] = useState<WinnerState | null>(null);
    const now = useNow();
    const auth = window.__AUTH_BOOTSTRAP__ ?? {
        authenticated: false,
        displayName: null,
        subjectId: null,
        isAdmin: false,
    };

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
                        auctionResponse.finalWinnerId &&
                        auctionResponse.finalPrice !== null
                        ? {
                              winnerId: auctionResponse.finalWinnerId,
                              amount: auctionResponse.finalPrice,
                              auctionVersion: auctionResponse.version,
                          }
                        : null,
                );
            })
            .catch((caught) =>
                setLoadError(caught instanceof Error ? caught.message : 'Unable to load auction.'),
            )
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
                        finalWinnerId: event.winnerId,
                        finalPrice: event.amount,
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
                setActivity((current) =>
                    [`Winner selected: ${event.winnerId}`, ...current].slice(0, 4),
                );
            },
            onAuctionPurchased: (event) => {
                if (event.auctionId !== auctionId) {
                    return;
                }

                setAuction((current) => applyAuctionPurchased(current, event));
                setWinner((current) => {
                    if (current && event.auctionVersion < current.auctionVersion) {
                        return current;
                    }

                    return {
                        winnerId: event.bidderId,
                        amount: event.finalPrice,
                        selectedAtUtc: event.purchasedAtUtc,
                        auctionVersion: event.auctionVersion,
                    };
                });
                setFormMessage({
                    tone: 'error',
                    text:
                        event.bidderId.toLowerCase() === auth.subjectId?.toLowerCase()
                            ? 'Your Buy Now purchase was completed.'
                            : 'This auction was purchased by another buyer.',
                });
                setActivity((current) =>
                    [
                        `Purchased by ${event.bidderId}: ${formatMoney(event.finalPrice)}`,
                        ...current,
                    ].slice(0, 4),
                );
            },
            onAuctionCancelled: (event) => {
                if (event.auctionId !== auctionId) {
                    return;
                }

                setAuction((current) => applyAuctionCancelled(current, event));
                setFormMessage({
                    tone: 'error',
                    text: 'This auction was cancelled and is no longer accepting activity.',
                });
                setActivity((current) => ['Auction cancelled', ...current].slice(0, 4));
            },
        });

        return () => {
            socket.disconnect();
        };
    }, [auctionId, auth.subjectId]);

    const minimumBid = auction?.minimumValidBid ?? 0;
    const countdown = auction ? getCountdown(auction, now) : '';
    const timeEligible =
        !!auction &&
        auction.status === 'Open' &&
        now >= new Date(auction.startTimeUtc).getTime() &&
        now < new Date(auction.endTimeUtc).getTime();
    const biddingAtCeiling =
        auction?.saleMode === 'AuctionAndBuyNow' &&
        auction.buyNowPrice !== null &&
        minimumBid >= auction.buyNowPrice;
    const biddingUnavailable =
        !auth.authenticated ||
        !auction ||
        !timeEligible ||
        auction.status !== 'Open' ||
        biddingAtCeiling;
    const buyNowUnavailable =
        !auth.authenticated ||
        !auction ||
        !timeEligible ||
        auction.status !== 'Open' ||
        !['BuyNowOnly', 'AuctionAndBuyNow'].includes(auction.saleMode) ||
        auction.buyNowPrice === null ||
        auction.finalWinnerId !== null ||
        auction.finalPrice !== null;
    const terminal = auction?.status === 'Closed' || auction?.status === 'Cancelled';
    const displayedWinner =
        winner ??
        (auction?.status === 'Closed' &&
        (auction.finalWinnerId || auction.currentBidderId) &&
        (auction.finalPrice !== null || auction.currentBidAmount !== null)
            ? {
                  winnerId: auction.finalWinnerId ?? auction.currentBidderId!,
                  amount: auction.finalPrice ?? auction.currentBidAmount!,
                  auctionVersion: auction.version,
              }
            : null);

    async function onSubmit(event: FormEvent) {
        event.preventDefault();

        if (!auction || biddingUnavailable) {
            setFormMessage({
                tone: 'error',
                text: 'This auction is not accepting bids right now.',
            });
            return;
        }

        const numericAmount = Number(amount);
        if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
            setFormMessage({ tone: 'error', text: 'Enter a positive bid amount.' });
            return;
        }

        if (
            auction.saleMode === 'AuctionAndBuyNow' &&
            auction.buyNowPrice !== null &&
            numericAmount >= auction.buyNowPrice
        ) {
            setFormMessage({
                tone: 'error',
                text: 'Ordinary bids must be below the Buy Now price.',
            });
            return;
        }

        setSubmitting(true);
        setFormMessage(null);

        try {
            const response = await placeBid(auction.id, numericAmount);
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

            if (
                apiError?.details?.minimumValidBid !== undefined ||
                shouldRefreshAfterConflict(apiError?.code)
            ) {
                refresh();
            }
        } finally {
            setSubmitting(false);
        }
    }

    async function onBuyNowConfirm() {
        if (!auction || buyNowUnavailable || !auction.buyNowPrice) {
            setFormMessage({ tone: 'error', text: 'Buy Now is not available right now.' });
            setConfirmingPurchase(false);
            return;
        }

        setPurchasing(true);
        setFormMessage(null);

        try {
            const response = await buyNow(auction.id);
            setAuction((current) =>
                current
                    ? {
                          ...current,
                          status: 'Closed',
                          finalWinnerId: response.bidderId,
                          finalPrice: response.finalPrice,
                          version: response.auctionVersion,
                          updatedAtUtc: response.purchasedAtUtc,
                      }
                    : current,
            );
            setWinner({
                winnerId: response.bidderId,
                amount: response.finalPrice,
                selectedAtUtc: response.purchasedAtUtc,
                auctionVersion: response.auctionVersion,
            });
            setFormMessage({ tone: 'success', text: 'Your Buy Now purchase was completed.' });
            setActivity((current) =>
                [`Purchased: ${formatMoney(response.finalPrice)}`, ...current].slice(0, 4),
            );
        } catch (caught) {
            const apiError = caught instanceof ApiClientError ? caught.error : null;
            setFormMessage({
                tone: 'error',
                text: describeBuyNowError(apiError, caught),
            });
            if (apiError && shouldRefreshAfterConflict(apiError.code)) {
                refresh();
            }
        } finally {
            setPurchasing(false);
            setConfirmingPurchase(false);
        }
    }

    return (
        <Shell>
            <button className="back-button" onClick={() => navigateTo('/auctions')} type="button">
                Back to auctions
            </button>

            {loading && (
                <StateMessage
                    title="Loading auction"
                    message="Fetching auction detail and accepted bid history."
                />
            )}
            {loadError && (
                <StateMessage title="Auction unavailable" message={loadError} tone="error" />
            )}

            {auction && (
                <section className="detail-layout">
                    <article className="detail-main">
                        <div className="card-row">
                            <span className={`status-pill ${statusTone(auction.status)}`}>
                                {auction.status}
                            </span>
                            <LiveIndicator status={liveStatus} />
                        </div>
                        <h1>{auction.title}</h1>
                        <p className="description">{auction.description}</p>

                        <div className="price-panel">
                            <span>
                                {terminal
                                    ? auction.saleMode === 'AuctionOnly'
                                        ? auction.status === 'Cancelled'
                                            ? 'Auction cancelled'
                                            : 'Final bid'
                                        : auction.status === 'Cancelled'
                                          ? 'Auction cancelled'
                                          : 'Final price'
                                    : auction.currentBidAmount === null
                                      ? auction.saleMode === 'BuyNowOnly'
                                          ? 'Buy Now price'
                                          : 'Starting bid'
                                      : 'Current bid'}
                            </span>
                            <strong>
                                {formatMoney(
                                    terminal
                                        ? (auction.finalPrice ?? auction.currentBidAmount)
                                        : auction.saleMode === 'BuyNowOnly'
                                          ? auction.buyNowPrice
                                          : (auction.currentBidAmount ?? auction.startingPrice),
                                )}
                            </strong>
                            <small>
                                {auction.status === 'Closed' && auction.finalWinnerId
                                    ? `Winner: ${auction.finalWinnerId}`
                                    : auction.currentBidderId
                                      ? `Highest bidder: ${auction.currentBidderId}`
                                      : auction.saleMode === 'BuyNowOnly'
                                        ? 'Immediate purchase closes this auction'
                                        : 'No accepted bidder yet'}
                            </small>
                        </div>

                        {terminal && (
                            <section className="closed-panel" aria-label="Auction closed summary">
                                <span>
                                    {auction.status === 'Cancelled'
                                        ? 'Auction cancelled'
                                        : 'Auction closed'}
                                </span>
                                <strong>
                                    {auction.status === 'Cancelled'
                                        ? 'Bidding and Buy Now are no longer available.'
                                        : auction.finalPrice === null &&
                                            auction.currentBidAmount === null
                                          ? 'No bids were placed.'
                                          : `${auction.saleMode === 'AuctionOnly' ? 'Final bid' : 'Final price'} ${formatMoney(auction.finalPrice ?? auction.currentBidAmount)}`}
                                </strong>
                                {auction.status === 'Cancelled' ? (
                                    <p>
                                        Existing bid history is preserved; no winner was selected.
                                    </p>
                                ) : displayedWinner ? (
                                    <p>
                                        {displayedWinner.winnerId.toLowerCase() ===
                                        auth.subjectId?.toLowerCase()
                                            ? 'You won this auction.'
                                            : `Winner: ${displayedWinner.winnerId}`}
                                    </p>
                                ) : (
                                    <p>No winner was selected.</p>
                                )}
                            </section>
                        )}

                        <dl className="detail-metrics">
                            {!terminal && auction.saleMode !== 'BuyNowOnly' && (
                                <div>
                                    <dt>Next minimum</dt>
                                    <dd>{formatMoney(minimumBid)}</dd>
                                </div>
                            )}
                            <div>
                                <dt>Sale mode</dt>
                                <dd>{auction.saleMode}</dd>
                            </div>
                            {auction.buyNowPrice !== null && !terminal && (
                                <div>
                                    <dt>Buy Now price</dt>
                                    <dd>{formatMoney(auction.buyNowPrice)}</dd>
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
                            <h2>
                                {auction.saleMode === 'BuyNowOnly'
                                    ? 'Immediate purchase'
                                    : biddingUnavailable
                                      ? terminal
                                          ? auction.status === 'Cancelled'
                                              ? 'Auction cancelled'
                                              : 'Auction closed'
                                          : 'Bidding unavailable'
                                      : 'Place bid'}
                            </h2>
                            {!auth.authenticated && (
                                <p className="muted">
                                    <a href="/login">Sign in to bid or buy</a> to participate.
                                </p>
                            )}
                            {auth.authenticated && auction.saleMode !== 'BuyNowOnly' && (
                                <>
                                    <p className="muted">Signed in as {auth.displayName}.</p>
                                    <label>
                                        Bid amount
                                        <input
                                            min="1"
                                            step="1"
                                            inputMode="decimal"
                                            value={biddingUnavailable ? '' : amount}
                                            placeholder={
                                                biddingUnavailable ? 'Bidding closed' : undefined
                                            }
                                            disabled={biddingUnavailable}
                                            onChange={(event) => setAmount(event.target.value)}
                                        />
                                    </label>
                                    <button
                                        className="primary-button"
                                        disabled={submitting || biddingUnavailable}
                                        type="submit"
                                    >
                                        {biddingUnavailable
                                            ? biddingAtCeiling
                                                ? 'Bidding ceiling reached'
                                                : terminal
                                                  ? auction.status === 'Cancelled'
                                                      ? 'Auction cancelled'
                                                      : 'Auction closed'
                                                  : 'Bidding unavailable'
                                            : submitting
                                              ? 'Placing bid...'
                                              : 'Place bid'}
                                    </button>
                                    {biddingAtCeiling && (
                                        <p className="muted">
                                            No legal ordinary bid remains below the Buy Now price.
                                        </p>
                                    )}
                                </>
                            )}
                            {auction.saleMode === 'BuyNowOnly' && (
                                <p className="muted">
                                    This item is available by explicit purchase only. The Buy Now
                                    price is authoritative.
                                </p>
                            )}
                            {auction.saleMode !== 'AuctionOnly' && (
                                <section className="buy-now-panel" aria-label="Buy Now">
                                    <h3>Buy Now</h3>
                                    <strong>{formatMoney(auction.buyNowPrice)}</strong>
                                    <p>Purchase immediately and close the auction.</p>
                                    {!confirmingPurchase ? (
                                        <button
                                            className="secondary-button"
                                            disabled={purchasing || buyNowUnavailable}
                                            onClick={() => setConfirmingPurchase(true)}
                                            type="button"
                                        >
                                            {buyNowUnavailable ? 'Buy Now unavailable' : 'Buy Now'}
                                        </button>
                                    ) : (
                                        <div className="confirmation-panel">
                                            <p>
                                                Confirm purchase of {auction.title} for{' '}
                                                {formatMoney(auction.buyNowPrice)}. This immediately
                                                closes the auction.
                                            </p>
                                            <div className="confirmation-actions">
                                                <button
                                                    className="secondary-button"
                                                    disabled={purchasing}
                                                    onClick={() => setConfirmingPurchase(false)}
                                                    type="button"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    className="primary-button"
                                                    disabled={purchasing}
                                                    onClick={onBuyNowConfirm}
                                                    type="button"
                                                >
                                                    {purchasing
                                                        ? 'Purchasing...'
                                                        : 'Confirm Buy Now'}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </section>
                            )}
                            {formMessage && (
                                <p className={`form-message ${formMessage.tone}`}>
                                    {formMessage.text}
                                </p>
                            )}
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
