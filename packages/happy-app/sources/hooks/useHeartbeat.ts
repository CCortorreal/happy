import * as React from 'react';
import { getHeartbeat } from '@/sync/apiHeartbeat';
import { HeartbeatView } from '@/sync/heartbeatTypes';
import { useHonestFeed } from '@/hooks/useHonestFeed';

// useHeartbeat — Hearth MONITOR pillar (the CONTEXT gauge feed).
//
// A thin adapter over useHonestFeed (the #0-invariant primitive): polls GET /v1/heartbeat
// and inherits the three-state discipline. The organ ticks every 30s and daemonAlive is
// always true IN the file, so freshness IS liveness — a stale/unreachable feed is itself
// the daemon-dead signal, surfaced LOUD rather than a fake-calm "all seats fine". Poll at
// half the feed cadence (catch updates promptly without waste); idle-cheap when backgrounded.

const POLL_INTERVAL_MS = 15000;

export function useHeartbeat(): { view: HeartbeatView | null; unreachable: boolean } {
    const { data, unreachable } = useHonestFeed<HeartbeatView>(
        async (credentials) => {
            const response = await getHeartbeat(credentials);
            return { stale: response.stale, data: response.stale ? null : response.view };
        },
        { intervalMs: POLL_INTERVAL_MS },
    );
    return React.useMemo(() => ({ view: data, unreachable }), [data, unreachable]);
}
