import { z } from 'zod';

// Congress kanban types (cockpit-v2, 2026-07-02; floors rework CKP-02).
//
// Mirrors GET /v1/congress/kanban. The server keys work-item counts by
// building FLOOR (each floor's hive/tasks.json — atlas, crew, spine…), not by
// congress seat: the original seat-keyed schema here had no server data that
// could ever satisfy it (every poll failed parse — the CKP-02 half of the
// error storm). Carlos's call (2026-07-02): floors are first-class — the
// cockpit renders the building's boards in their own FLOORS plane, and seat
// lanes no longer pretend to have per-seat kanban.
//
// Envelope matches congressRelayTypes.ts's convention: { ts, stale, floors },
// numeric epoch-ms timestamps throughout. `stale: true` means the offices root
// itself was unreachable (building gone) — distinct from a readable-but-
// boardless root, which is a fresh empty `floors: []`.

// Chip-shaped counts — consumed by KanbanChips. Nullable per-lane values keep
// the honest-omission discipline (a chip renders only for a real count).
export const CongressKanbanCountsSchema = z.object({
    todo: z.number().nullable(),
    doing: z.number().nullable(),
    blocked: z.number().nullable(),
    done: z.number().nullable(),
});

export const CongressFloorBoardSchema = z.object({
    floor: z.string(),
    todo: z.number(),
    doing: z.number(),
    blocked: z.number(),
    done: z.number(),
    total: z.number(),
    // board file mtime (epoch ms) — the honest-staleness signal per floor
    ts: z.number(),
});

export const CongressKanbanResponseSchema = z.object({
    ts: z.number().nullable(),
    stale: z.boolean(),
    floors: z.array(CongressFloorBoardSchema),
});

export type CongressKanbanCounts = z.infer<typeof CongressKanbanCountsSchema>;
export type CongressFloorBoard = z.infer<typeof CongressFloorBoardSchema>;
export type CongressKanbanResponse = z.infer<typeof CongressKanbanResponseSchema>;
