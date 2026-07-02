import * as React from 'react';
import { getCongressRelay } from '@/sync/apiCongressRelay';
import { CongressRelayItem } from '@/sync/congressRelayTypes';
import { useHonestFeed } from '@/hooks/useHonestFeed';

// useCongressRelay — cockpit-v2 RELAY plane (mission A3, inter-seat traffic feed).
//
// Polls GET /v1/congress/relay and returns the newest-last relay item list,
// same thin-adapter shape as useBacklog/useCongressKanban over useHonestFeed.
//
// The route may not exist server-side yet (see apiCongressRelay.ts) — a
// 404/unreachable feed degrades to an empty list via useHonestFeed's
// LOUD-guard, which the RELAY plane reads as an honest empty state, never a
// fabricated row.

export interface CongressRelay {
    items: CongressRelayItem[];
    unreachable: boolean;
}

const EMPTY_ITEMS: CongressRelayItem[] = [];

export function useCongressRelay(): CongressRelay {
    const { data, unreachable } = useHonestFeed<CongressRelayItem[]>(
        async (credentials) => {
            const response = await getCongressRelay(credentials);
            if (response.stale) {
                return { stale: true, data: null };
            }
            return { stale: false, data: response.items };
        },
        { hasContent: (items) => items.length > 0 },
    );

    return React.useMemo(() => ({
        items: data ?? EMPTY_ITEMS,
        unreachable,
    }), [data, unreachable]);
}
