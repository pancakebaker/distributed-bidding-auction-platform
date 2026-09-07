/**
 * Routes the public auction experience between discovery and auction detail pages.
 */
import { AuctionDetailPage } from './pages/AuctionDetailPage';
import { AuctionListPage } from './pages/AuctionListPage';
import { usePath } from './hooks/usePath';

/**
 * Routes between auction discovery and auction detail without replacing Laravel routing.
 */
export function AuctionApp() {
    const path = usePath();
    const auctionMatch = path.match(/^\/auctions\/([^/]+)$/);

    if (auctionMatch) {
        return <AuctionDetailPage auctionId={auctionMatch[1]} />;
    }

    return <AuctionListPage />;
}
