import * as React from 'react';
import { getBacklog } from '@/sync/apiBacklog';
import { BacklogView } from '@/sync/backlogTypes';
import { useHonestFeed } from '@/hooks/useHonestFeed';

// useBacklog — Hearth MONITOR pillar (the backlog gauge feed).
//
// A thin adapter over useHonestFeed (the #0-invariant primitive): polls GET /v1/backlog
// and inherits the three-state discipline (render / quiet / LOUD-unreachable, keep-
// last-good). The server's `stale` flag (its own ts-age staleness backstop) maps
// straight onto the LOUD path, so a dead-or-frozen feed reads loud rather than serving
// a fake-fresh "0 backlog". Backlog moves lazily (queue depth, not a live meter), so
// poll idle-cheap — same cadence family as useDisk.
//
// `hasContent` treats an empty-but-present view (total === 0) as genuinely empty for
// the LOUD test — a calm all-clear backlog still counts as "nothing worth keeping",
// same discipline as an empty knock-queue.

const POLL_INTERVAL_MS = 30000;   // backlog moves slowly; idle-cheap polling

export function useBacklog(): { view: BacklogView | null; unreachable: boolean } {
    const { data, unreachable } = useHonestFeed<BacklogView>(
        async (credentials) => {
            const response = await getBacklog(credentials);
            return { stale: response.stale, data: response.stale ? null : response.view };
        },
        { intervalMs: POLL_INTERVAL_MS, hasContent: (v) => v.total > 0 },
    );
    return React.useMemo(() => ({ view: data, unreachable }), [data, unreachable]);
}
