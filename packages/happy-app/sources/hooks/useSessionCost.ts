import * as React from 'react';
import { useAuth } from '@/auth/AuthContext';
import { getUsageForPeriod, calculateTotals } from '@/sync/apiUsage';

/**
 * useSessionCost — live cumulative USD cost for a single session, for the
 * session-chrome cost readout (the "surface token cost" prime-directive leg of
 * happy-seat-own-and-dogfood).
 *
 * WHY this shape:
 * - Reuses the SAME server-aggregated, already-priced path the Usage settings
 *   screen uses (`getUsageForPeriod` -> `calculateTotals`), so the chrome badge
 *   agrees with the Usage panel by construction — one source of cost truth.
 *   (The live reducer `latestUsage` is NOT used: it carries last-turn tokens +
 *   contextSize only, resets on compaction, and has no cumulative cost.)
 * - Polls on an interval because cost accrues while the session runs. The
 *   underlying query already backs off on failure, and this hook keeps the last
 *   good value on error rather than surfacing one — matching the app principle
 *   "never show a loading error, always just retry".
 * - `tier` thresholds mirror the building's `budget-config.softCostUsd` ($5) and
 *   the terminal statusline leg, so both cost surfaces color-agree.
 */

const SOFT_COST_USD = 5;   // mirrors budget-config.softCostUsd + the statusline leg
const REFRESH_MS = 30_000; // cost accrues as the session runs

export type CostTier = 'normal' | 'soft' | 'high';

export interface SessionCost {
    cost: number;                            // cumulative USD for today's session window
    costByModel: Record<string, number>;
    tier: CostTier;                          // normal <$soft · soft <5x · high >=5x
    loading: boolean;
    refresh: () => void;
}

function tierFor(cost: number): CostTier {
    if (cost >= SOFT_COST_USD * 5) return 'high';
    if (cost >= SOFT_COST_USD) return 'soft';
    return 'normal';
}

export function useSessionCost(sessionId: string): SessionCost {
    const auth = useAuth();
    const [cost, setCost] = React.useState(0);
    const [costByModel, setCostByModel] = React.useState<Record<string, number>>({});
    const [loading, setLoading] = React.useState(true);

    const load = React.useCallback(async () => {
        if (!auth.credentials || !sessionId) return;
        try {
            const res = await getUsageForPeriod(auth.credentials, 'today', sessionId);
            const totals = calculateTotals(res.usage || []);
            setCost(totals.totalCost);
            setCostByModel(totals.costByModel);
        } catch {
            // retry-not-error: keep the last good value; the next tick retries.
        } finally {
            setLoading(false);
        }
    }, [auth.credentials, sessionId]);

    React.useEffect(() => {
        load();
        const id = setInterval(load, REFRESH_MS);
        return () => clearInterval(id);
    }, [load]);

    return { cost, costByModel, tier: tierFor(cost), loading, refresh: load };
}
