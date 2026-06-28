import * as React from 'react';
import { TokenStorage } from '@/auth/tokenStorage';
import { getWarden } from '@/sync/apiWarden';
import { WardenItem } from '@/sync/wardenTypes';

// useWarden — Hearth P1 (the knock-cards).
//
// Polls GET /v1/warden and returns the for-carlos items. Discipline (carried
// from munder's renderer): poll, read-only, defensive, KEEP LAST GOOD. getWarden
// never throws — on an IO/parse failure (or the feed not being live yet) it
// returns `{ stale: true, items: [] }`. We distinguish that from a genuinely
// empty queue via the `stale` flag: a stale result is dropped (we keep the
// previous items so cards don't flicker away), a fresh empty result is adopted
// (a true "nothing pending" -> render nothing).

const POLL_INTERVAL_MS = 5000;

export function useWarden(): WardenItem[] {
    const [items, setItems] = React.useState<WardenItem[]>([]);

    React.useEffect(() => {
        let mounted = true;
        let timer: ReturnType<typeof setTimeout> | null = null;

        const poll = async () => {
            try {
                const credentials = await TokenStorage.getCredentials();
                if (mounted && credentials) {
                    const response = await getWarden(credentials);
                    if (mounted && !response.stale) {
                        setItems(response.items);
                    }
                }
            } catch {
                // Defensive: never surface a polling error; retry next tick.
            } finally {
                if (mounted) {
                    timer = setTimeout(poll, POLL_INTERVAL_MS);
                }
            }
        };

        poll();

        return () => {
            mounted = false;
            if (timer) {
                clearTimeout(timer);
            }
        };
    }, []);

    return items;
}
