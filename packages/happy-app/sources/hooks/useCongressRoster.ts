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
    // LOUD-guard (loom's keystone lesson): the feed-reader must distinguish three
    // states and NEVER collapse a broken feed into a silent-empty (which looks
    // identical to a genuinely quiet feed — that masking is exactly why the roster
    // GET was dark for so long). `unreachable` = persistent stale/failed reads with
    // nothing to show -> the render must say so LOUDLY, not render blank.
    unreachable: boolean;
}

const EMPTY_ROSTER: CongressRoster = { sessions: new Map(), workers: [], unreachable: false };

const POLL_INTERVAL_MS = 5000;
// Go loud only after a few consecutive failures so a single mid-write blip doesn't
// flash an alarm — but a real outage surfaces within ~15s instead of staying dark.
const UNREACHABLE_AFTER = 3;

export function useCongressRoster(): CongressRoster {
    const [roster, setRoster] = React.useState<CongressRoster>(EMPTY_ROSTER);
    const failures = React.useRef(0);

    React.useEffect(() => {
        let mounted = true;
        let timer: ReturnType<typeof setTimeout> | null = null;

        // A failed/stale read keeps last-good data, but if we've never had data and
        // keep failing, flip `unreachable` LOUD (state 3) — distinct from a fresh
        // empty roster (state 2: stale=false + zero seats = a true "nobody home").
        const markFailure = () => {
            failures.current += 1;
            if (mounted) {
                setRoster((prev) => {
                    const loud = failures.current >= UNREACHABLE_AFTER
                        && prev.sessions.size === 0 && prev.workers.length === 0;
                    return prev.unreachable === loud ? prev : { ...prev, unreachable: loud };
                });
            }
        };

        const poll = async () => {
            try {
                const credentials = await TokenStorage.getCredentials();
                if (mounted && credentials) {
                    const response = await getCongressRoster(credentials);
                    if (mounted && !response.stale) {
                        // State 1/2: a good read (data or a genuine empty). Adopt + clear loud.
                        failures.current = 0;
                        const sessions = new Map<string, CongressSeat>();
                        const workers: CongressSeat[] = [];
                        for (const seat of response.seats) {
                            if (seat.kind === 'worker' || (seat.cuid == null && seat.claudeSid == null)) {
                                workers.push(seat);
                            } else {
                                // DUAL-KEY the JOIN: claudeSid (stable, daemon-independent —
                                // primary) AND cuid (fallback). A row matches on either key,
                                // so the Hearthside join survives daemon-restart cuid churn.
                                if (seat.claudeSid) sessions.set(seat.claudeSid, seat);
                                if (seat.cuid) sessions.set(seat.cuid, seat);
                            }
                        }
                        setRoster({ sessions, workers, unreachable: false });
                    } else if (mounted) {
                        // State 3: stale read (server couldn't read/parse the feed).
                        markFailure();
                    }
                }
            } catch {
                // Transport failure — also state 3 (couldn't reach the feed).
                markFailure();
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
