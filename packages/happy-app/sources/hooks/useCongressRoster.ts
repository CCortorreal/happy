import * as React from 'react';
import { getCongressRoster, joinRosterToSessions } from '@/sync/apiCongress';
import { CongressSeat } from '@/sync/congressTypes';
import { useHonestFeed } from '@/hooks/useHonestFeed';

// useCongressRoster — Hearth Phase 0.
//
// Polls GET /v1/congress/roster and returns the seats-oracle roster. Sessions whose id
// appears in the map ARE congress lanes; the SessionsList renders their role/pedal as
// identity and the oracle `verdict` as liveness (NOT session.active — the #170 lying
// 15-min lastActiveAt proxy).
//
// Built on useHonestFeed (the #0-invariant primitive): the dual-key map-build is the
// per-feed transform inside the fetcher; the three-state LOUD-guard (the keystone lesson
// that kept this very GET dark for hours when it collapsed broken-into-empty) is now the
// shared machinery. `hasContent` treats an empty roster as nothing-to-keep so a feed that
// goes dark after publishing seats still escalates LOUD.
//
// The roster carries two row kinds:
//   - session rows (cuid/claudeSid set) → keyed by BOTH claudeSid (stable, daemon-
//     independent — primary) and cuid (fallback) for the JOIN onto session.id, so the
//     Hearthside join survives daemon-restart cuid churn;
//   - worker rows (kind==='worker', no ids) → a separate list, NEVER joined (a worker is
//     watched, not a conversable session).

export interface CongressRoster {
    sessions: Map<string, CongressSeat>;
    workers: CongressSeat[];
    // LOUD-guard: persistent stale/failed reads with nothing to show -> the render must
    // say so LOUDLY, not render blank (a broken feed must not masquerade as quiet).
    unreachable: boolean;
}

interface RosterData {
    sessions: Map<string, CongressSeat>;
    workers: CongressSeat[];
}

const EMPTY_SESSIONS = new Map<string, CongressSeat>();
const EMPTY_WORKERS: CongressSeat[] = [];

export function useCongressRoster(): CongressRoster {
    const { data, unreachable } = useHonestFeed<RosterData>(
        async (credentials) => {
            const response = await getCongressRoster(credentials);
            if (response.stale) {
                return { stale: true, data: null };
            }
            const sessions = new Map<string, CongressSeat>();
            const workers: CongressSeat[] = [];
            for (const seat of response.seats) {
                if (seat.kind === 'worker' || (seat.cuid == null && seat.claudeSid == null)) {
                    workers.push(seat);
                } else {
                    if (seat.claudeSid) sessions.set(seat.claudeSid, seat);
                    if (seat.cuid) sessions.set(seat.cuid, seat);
                }
            }
            return { stale: false, data: { sessions, workers } };
        },
        { hasContent: (d) => d.sessions.size > 0 || d.workers.length > 0 },
    );

    return React.useMemo(() => ({
        sessions: data?.sessions ?? EMPTY_SESSIONS,
        workers: data?.workers ?? EMPTY_WORKERS,
        unreachable,
    }), [data, unreachable]);
}

// Re-exported for consumers that want to narrow a roster to only the session ids
// currently on screen (the strict cuid === session.id projection).
export { joinRosterToSessions };
