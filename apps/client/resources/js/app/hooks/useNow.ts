/**
 * Owns the public auction countdown clock lifecycle.
 */
import { useEffect, useState } from 'react';

/**
 * Provides the current time for auction countdown rendering.
 */
export function useNow() {
    const [now, setNow] = useState(Date.now());

    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, []);

    return now;
}
