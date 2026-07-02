import * as React from 'react';
import { getVram } from '@/sync/apiVram';
import { VramView } from '@/sync/vramTypes';
import { useHonestFeed } from '@/hooks/useHonestFeed';

// useVram — Hearth MONITOR pillar (the VRAM gauge feed).
//
// A thin adapter over useHonestFeed (the #0-invariant primitive): polls GET /v1/vram
// and inherits the three-state discipline (render / quiet / LOUD-unreachable, keep-
// last-good). The server's `stale` flag — which now also fires on a too-old reading
// (the ts-age backstop) — maps straight onto the LOUD path, so a dead-or-frozen feed
// reads loud rather than serving a fake-fresh "0GB used".

export function useVram(): { view: VramView | null; unreachable: boolean } {
    const { data, unreachable } = useHonestFeed<VramView>(
        async (credentials, signal) => {
            const response = await getVram(credentials, signal);
            return { stale: response.stale, data: response.stale ? null : response.view };
        },
        // hasContent — closes G13 (permanently-dead-feed regression): without a
        // predicate, once ANY successful read lands, `contentful(prev.data)` in
        // useHonestFeed reads true forever and `unreachable` can never re-trip.
        // A dead GPU projection ({} with totalMB:0 and no consumers) counts as
        // empty-but-fresh so a later persistent outage still goes LOUD.
        { hasContent: (view) => view.totalMB > 0 || view.consumers.length > 0 },
    );
    return React.useMemo(() => ({ view: data, unreachable }), [data, unreachable]);
}
