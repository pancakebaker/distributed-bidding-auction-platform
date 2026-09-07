/**
 * Tracks the current public auction path without introducing a client-side router.
 */
import { useEffect, useState } from 'react';

/**
 * Tracks public auction history changes.
 */
export function usePath() {
    const [path, setPath] = useState(window.location.pathname);

    useEffect(() => {
        const listener = () => setPath(window.location.pathname);
        window.addEventListener('popstate', listener);
        return () => window.removeEventListener('popstate', listener);
    }, []);

    return path;
}
