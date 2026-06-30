import { CongressSeat } from './congressTypes';

// liveness.ts — PR-14: ONE reconciled liveness verdict.
//
// Per the failure-log's explicit fix direction: build one verdict function the way
// `floor-state.cjs` already does for the building (pid-identity proof, THEN a beat/
// turn-freshness check decides serving-vs-wedged, fail-closed throughout) — apply the
// SAME pattern here, don't reinvent it. The bug this kills (G10/G14): the session row
// was reading "online" off a raw signal (a live PID / the oracle's bare verdict string)
// without reconciling it against whether the POLL itself can be trusted right now and
// whether the seat has actually taken a turn recently. A contradictory raw-signal pair
// (oracle says ALIVE, but the roster poll is unreachable, OR the seat has been silent
// far past its own staleness fence) must never collapse into a confident single
// "online" — it must render as a visibly distinct, honest state.
//
// Mirrors floor-state.cjs's two-stage shape:
//   1. identity/reachability proof  -> can we trust this verdict AT ALL right now?
//   2. serving-vs-wedged (turn-beat) -> GIVEN trust, is it actually taking turns?

export type LivenessVerdict =
    // The poll itself can't be trusted (persistently unreachable, nothing to show) —
    // fail-closed: never report a confident state off a feed we can't currently trust.
    | 'unverified'
    // The oracle reports the seat as dead/crashed/incident — confidently dead.
    | 'dead'
    // Identity proven alive AND a turn-beat within the staleness fence — genuinely live.
    | 'alive'
    // Identity proven alive (process/seat present) but NO turn-beat within the fence —
    // resumed-but-idle, distinct from both 'alive' and 'dead'. This is the exact state
    // that used to collapse into "online" against a dead/stale signal.
    | 'idle'
    // Oracle-reported transitional/degraded state (e.g. WEDGED) — alive but not healthy.
    | 'wedged';

export interface ReconciledLiveness {
    verdict: LivenessVerdict;
    // True only for 'alive' — the single source of truth the ●online dot derives from.
    // Never true at the same time the underlying reasons would call the seat dead/stale;
    // verdict and dot are derived from the SAME function so they cannot disagree.
    online: boolean;
}

// Same fence voiceThought() already uses to decide whether a thought reads "fresh" —
// reused here so the dot and the thought-line never disagree about what counts as stale.
const TURN_STALE_MS = 3 * 60 * 1000;

function rawVerdictTier(raw: string): 'alive' | 'wedged' | 'dead' | 'unknown' {
    const v = raw.trim().toUpperCase();
    if (v === 'ALIVE') return 'alive';
    if (v === 'WEDGED') return 'wedged';
    if (v.includes('DEAD') || v.includes('INCIDENT') || v.includes('CRASH')) return 'dead';
    return 'unknown';
}

/**
 * Derive ONE reconciled liveness verdict for a congress seat, reconciling the oracle's
 * raw `verdict` string against the actual poll-liveness (`rosterUnreachable`, the same
 * honest-feed signal the gauges already use) and the seat's own turn-beat freshness.
 *
 * Fail-closed: any signal we can't currently trust degrades toward 'unverified'/'idle',
 * never toward a confident 'alive'. This is the single function PR-13's dot and any
 * future consumer must call — never re-derive liveness from a raw field directly.
 */
export function deriveLiveness(seat: CongressSeat | undefined, rosterUnreachable: boolean): ReconciledLiveness {
    if (!seat) {
        return { verdict: 'unverified', online: false };
    }

    // Stage 1 — can we trust ANY verdict right now? A persistently unreachable poll
    // (the same `unreachable` useHonestFeed already computes for the gauges) means the
    // data we'd reconcile against is itself stale/unprovable — fail closed rather than
    // keep showing a last-known-good "online" against a feed that can no longer prove it.
    if (rosterUnreachable) {
        return { verdict: 'unverified', online: false };
    }

    // A collided identity's transcript-derived fields aren't attributable to this seat;
    // the oracle already nulls them, but the verdict itself is still safe to read.
    const tier = rawVerdictTier(seat.verdict);

    if (tier === 'dead') {
        return { verdict: 'dead', online: false };
    }
    if (tier === 'unknown') {
        // DAEMON-LOST / idle-cold / unrecognized vocab — fail-closed, never online.
        return { verdict: 'unverified', online: false };
    }
    if (tier === 'wedged') {
        return { verdict: 'wedged', online: false };
    }

    // tier === 'alive': identity is proven (the oracle's own PID/process check) — now
    // reconcile against the turn-beat, exactly like floor-state.cjs's servingVerdict()
    // decides serving-vs-wedged AFTER identity is proven. A live process with no recent
    // turn is "resumed but idle," not "online" — the contradictory pair (live PID + idle
    // brain) the spec calls out must never collapse into one ambiguous dot.
    if (seat.joinCollision) {
        // Identity itself is unverifiable for THIS row (shared claudeSid) — can't claim
        // a fresh turn-beat belongs to this seat. Fail closed to idle, not alive.
        return { verdict: 'idle', online: false };
    }

    const ageMs = seat.lastTextTs != null ? Date.now() - seat.lastTextTs : null;
    const hasFreshTurn = ageMs != null && ageMs < TURN_STALE_MS;
    // currentWork is a deliberate, live-asserted activity phrase (same R4 ladder
    // voiceThought() uses) — treat its presence as a turn-beat too, even without a ts.
    const hasDeclaredWork = !!seat.currentWork?.trim();

    if (hasFreshTurn || hasDeclaredWork) {
        return { verdict: 'alive', online: true };
    }
    // Identity proven alive, but no evidence of a recent turn — resumed-but-idle.
    return { verdict: 'idle', online: false };
}
