import * as React from 'react';
import { getCongressKanban } from '@/sync/apiCongressKanban';
import { CongressKanbanCounts } from '@/sync/congressKanbanTypes';
import { useHonestFeed } from '@/hooks/useHonestFeed';

// useCongressKanban — cockpit-v2 work-state grid (mission A3, kanban chips).
//
// Polls GET /v1/congress/kanban and returns per-seat {todo,doing,blocked,done}
// counts keyed by seat id, mirroring useCongressRoster's/useBacklog's thin
// adapter shape over the shared useHonestFeed primitive.
//
// The route may not exist server-side yet (see apiCongressKanban.ts) — a
// 404/unreachable feed degrades to an empty map via useHonestFeed's LOUD-guard,
// which LaneTile reads as "no chips" (honest omission), never zeros-as-real.
// `hasContent` treats an empty seat-map as nothing-to-keep so a feed that goes
// dark after publishing counts still escalates LOUD instead of quietly hiding.

export interface CongressKanban {
    seats: Map<string, CongressKanbanCounts>;
    unreachable: boolean;
}

const EMPTY_SEATS = new Map<string, CongressKanbanCounts>();

export function useCongressKanban(): CongressKanban {
    const { data, unreachable } = useHonestFeed<Map<string, CongressKanbanCounts>>(
        async (credentials) => {
            const response = await getCongressKanban(credentials);
            if (response.stale) {
                return { stale: true, data: null };
            }
            const seats = new Map<string, CongressKanbanCounts>(Object.entries(response.seats));
            return { stale: false, data: seats };
        },
        { hasContent: (seats) => seats.size > 0 },
    );

    return React.useMemo(() => ({
        seats: data ?? EMPTY_SEATS,
        unreachable,
    }), [data, unreachable]);
}
