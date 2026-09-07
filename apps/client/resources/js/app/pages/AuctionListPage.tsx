/**
 * Displays the public auction discovery page.
 */
import { useEffect, useState } from 'react';
import { getAuctions } from '../../api';
import type { AuctionSummary } from '../../types';
import { Shell, StateMessage } from '../components/PublicComponents';
import { useNow } from '../hooks/useNow';
import { formatDate, formatMoney, getCountdown, statusTone } from '../utils/auction';
import { navigateTo } from '../utils/navigation';
/**
 * Renders auction discovery data from the authoritative API.
 */
export function AuctionListPage() {
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
