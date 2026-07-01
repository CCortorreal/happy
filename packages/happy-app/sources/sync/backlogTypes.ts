import { z } from 'zod';

// Backlog gauge types (Hearth — MONITOR pillar). Mirrors GET /v1/backlog, which
// projects infra's backlog feed into a clean wire shape (the infra-raw-shape coupling
// lives in ONE place — the server route — so the gauge + client never track its churn).
// Read-only, same shape family as vram/disk/heartbeat.
//
// Per the happy-seat thread's spec (infra commit 138552a), the raw feed is a flat
// top-level shape: { ts, backlog: { total, perSeat: [{ seat, count, oldestAgeSec }] } }.
// `oldestAgeSec` is the level+AGE honesty signal (not a rate/ETA here — a backlog's
// urgency is "how long has the oldest item waited," not a fill trend) — honest-null
// when a seat's backlog is empty (nothing to be old).

export const BacklogSeatSchema = z.object({
    seat: z.string(),
    count: z.number(),
    oldestAgeSec: z.number().nullable(),
});

export const BacklogViewSchema = z.object({
    total: z.number(),
    perSeat: z.array(BacklogSeatSchema),
});

// GET /v1/backlog response: the view + the LOUD-guard `stale` (three-state feed
// discipline — a broken/unreadable feed is NEVER a silent zero).
export const BacklogResponseSchema = z.object({
    stale: z.boolean(),
    view: BacklogViewSchema.nullable(),
});

export type BacklogSeat = z.infer<typeof BacklogSeatSchema>;
export type BacklogView = z.infer<typeof BacklogViewSchema>;
export type BacklogResponse = z.infer<typeof BacklogResponseSchema>;
