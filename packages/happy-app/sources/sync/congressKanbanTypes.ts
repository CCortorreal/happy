import { z } from 'zod';

// Congress kanban types (cockpit-v2 work-state grid, 2026-07-02).
//
// Mirrors a future GET /v1/congress/kanban response. Mission A3: per-lane
// todo/doing/blocked/done counts for the compact kanban chips on each
// LaneTile — the SAME shape family as the roster's `cardCounts` slot
// (congressTypes.ts's CongressCardCountsSchema), just served as its own
// keyed-by-seat feed rather than embedded per-roster-row, since the roster
// route has no oracle-side tasks feed to back it yet (see congressRoutes.ts's
// cardCounts comment — honest-null there).
//
// Route does not exist server-side yet (grepped: no /v1/congress/kanban in
// congressRoutes.ts as of this commit) — this client codes against the wire
// contract now, same as apiCongress.ts's getCongressRoster did before the
// roster route landed. Until the route ships, getCongressKanban's non-OK
// fallback (stale:true, seats:{}) makes every lane's chips honestly absent
// (never zeros-as-real) via useHonestFeed's three-state discipline.

export const CongressKanbanCountsSchema = z.object({
    todo: z.number().nullable(),
    doing: z.number().nullable(),
    blocked: z.number().nullable(),
    done: z.number().nullable(),
});

// Keyed by `seat` (the same congress seat id the roster rows carry), not an
// array — a lane tile looks up its own seat's counts by direct key, no scan.
export const CongressKanbanResponseSchema = z.object({
    ts: z.number().nullable(),
    stale: z.boolean(),
    seats: z.record(z.string(), CongressKanbanCountsSchema),
});

export type CongressKanbanCounts = z.infer<typeof CongressKanbanCountsSchema>;
export type CongressKanbanResponse = z.infer<typeof CongressKanbanResponseSchema>;
