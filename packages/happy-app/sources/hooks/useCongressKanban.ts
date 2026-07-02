import * as React from 'react';
import { getCongressKanban } from '@/sync/apiCongressKanban';
import { CongressFloorBoard } from '@/sync/congressKanbanTypes';
import { useHonestFeed } from '@/hooks/useHonestFeed';

// useCongressKanban — cockpit-v2 FLOORS plane (CKP-02 floors rework).
//
// Polls GET /v1/congress/kanban and returns the building's per-floor
// todo/doing/blocked/done boards, mirroring useCongressRelay's thin adapter
// shape over the shared useHonestFeed primitive. The server keys by building
// FLOOR (each floor's hive/tasks.json) — the old per-seat map here never had
// server data that could satisfy it.
//
// A 404/unreachable/stale feed degrades to an empty list via useHonestFeed's
// LOUD-guard, which FloorsPlane reads as an honest unreachable state, never
// zeros-as-real. `hasContent` treats an empty floor list as nothing-to-keep so
// a feed that goes dark after publishing boards still escalates LOUD.

export interface CongressFloors {
    floors: CongressFloorBoard[];
    unreachable: boolean;
}

const EMPTY_FLOORS: CongressFloorBoard[] = [];

export function useCongressKanban(): CongressFloors {
    const { data, unreachable } = useHonestFeed<CongressFloorBoard[]>(
        async (credentials) => {
            const response = await getCongressKanban(credentials);
            if (response.stale) {
                return { stale: true, data: null };
            }
            return { stale: false, data: response.floors };
        },
        { hasContent: (floors) => floors.length > 0 },
    );

    return React.useMemo(() => ({
        floors: data ?? EMPTY_FLOORS,
        unreachable,
    }), [data, unreachable]);
}
