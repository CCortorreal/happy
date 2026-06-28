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
// The roster carries two row kinds:
//   - session rows (cuid set) → keyed by cuid for the JOIN onto session.id;
//   - worker rows (kind==='worker', cuid null) → a separate list, NEVER joined
//     (a worker is watched, not a conversable session).
// When the roster is empty (infra hasn't published congress-roster.json yet),
// both are empty and the SessionsList enrichment renders nothing.

export interface CongressRoster {
    sessions: Map<string, CongressSeat>;
    workers: CongressSeat[];
}

const EMPTY_ROSTER: CongressRoster = { sessions: new Map(), workers: [] };

const POLL_INTERVAL_MS = 5000;

export function useCongressRoster(): CongressRoster {
    const [roster, setRoster] = React.useState<CongressRoster>(EMPTY_ROSTER);

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
                        const sessions = new Map<string, CongressSeat>();
                        const workers: CongressSeat[] = [];
                        for (const seat of response.seats) {
                            if (seat.kind === 'worker' || seat.cuid == null) {
                                workers.push(seat);
                            } else {
                                // cuid is non-null here → safe O(1) JOIN key.
                                sessions.set(seat.cuid, seat);
                            }
                        }
                        setRoster({ sessions, workers });
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
