import * as React from 'react';
import { TokenStorage } from '@/auth/tokenStorage';
import { getCongressRoster, joinRosterToSessions } from '@/sync/apiCongress';
import { CongressSeat } from '@/sync/congressTypes';

// useCongressRoster — Hearth Phase 0.
//
// Polls GET /v1/congress/roster and returns the seats-oracle roster keyed by
// session id (the JOIN key cuid === session.id). Sessions whose id appears in
// this map ARE congress lanes; the SessionsList renders their role/pedal as
// identity and the oracle `verdict` as liveness (NOT session.active — the #170
// lying 15-min lastActiveAt proxy).
//
// Discipline (carried from munder's renderer): poll, read-only, defensive, and
// KEEP LAST GOOD. getCongressRoster never throws — on an IO/parse failure (or
// the feed not being live yet) it returns `{ stale: true, seats: [] }`. We
// distinguish that from a genuinely empty roster via the `stale` flag: a stale
// result is dropped (we keep the previous map so cards don't flicker away),
// while a fresh empty result is adopted (a true "no congress seats" state).
//
// When the roster is empty (infra hasn't published congress-roster.json yet),
// the returned map is empty and the SessionsList enrichment renders nothing —
// zero behavior change until the feed lands.

const POLL_INTERVAL_MS = 5000;

export function useCongressRoster(): Map<string, CongressSeat> {
    const [roster, setRoster] = React.useState<Map<string, CongressSeat>>(() => new Map());

    React.useEffect(() => {
        let mounted = true;
        let timer: ReturnType<typeof setTimeout> | null = null;

        const poll = async () => {
            try {
                const credentials = await TokenStorage.getCredentials();
                if (mounted && credentials) {
                    const response = await getCongressRoster(credentials);
                    // Keep last-good on a stale/failed read; adopt fresh results
                    // (including a fresh empty roster — a true "nobody home").
                    if (mounted && !response.stale) {
                        // The JOIN to live session rows happens in the consumer,
                        // which knows the visible session ids. Here we key by cuid
                        // so the consumer can do an O(1) lookup per row.
                        const next = new Map<string, CongressSeat>();
                        for (const seat of response.seats) {
                            next.set(seat.cuid, seat);
                        }
                        setRoster(next);
                    }
                }
            } catch {
                // Defensive: never surface a polling error; just retry next tick.
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

    return roster;
}

// Re-exported for consumers that want to narrow a roster to only the session ids
// currently on screen (the strict cuid === session.id projection).
export { joinRosterToSessions };
