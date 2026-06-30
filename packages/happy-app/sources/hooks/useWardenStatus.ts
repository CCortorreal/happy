import * as React from 'react';
import { getWardenStatus } from '@/sync/apiWarden';
import { useHonestFeed } from '@/hooks/useHonestFeed';

// useWardenStatus — PR-30 Slice 1 (the honest-death pip's data source).
//
// A thin adapter over useHonestFeed, same shape as useVram/useWarden. Polls
// GET /v1/warden/status and keeps last-good `ts` across transient hiccups (one
// missed poll never flashes the pip dark). IMPORTANT: this hook does NOT compute
// the pip's liveness verdict — it only surfaces the raw `ts` string. The age-band
// judgment (green < 60s / greying 60s-stale / grey-dead > 60s) is the CALLER's job,
// recomputed against the client's own clock every tick (see WardenDeathPip) — never
// trusting any "I'm alive" implication from a successful fetch alone. A feed that
// goes unreachable degrades the pip the same way a stale `ts` does: both read as
// "no fresh proof of life", which is the honesty-spine point.

export interface WardenStatusView {
    ts: string | null;
}

export function useWardenStatus(): { status: WardenStatusView | null; unreachable: boolean } {
    const { data, unreachable } = useHonestFeed<WardenStatusView>(
        async (credentials) => {
            const response = await getWardenStatus(credentials);
            return { stale: response.stale, data: response.stale ? null : { ts: response.ts } };
        },
    );
    return React.useMemo(() => ({ status: data, unreachable }), [data, unreachable]);
}
