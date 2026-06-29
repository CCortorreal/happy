import { z } from 'zod';

// Heartbeat / CONTEXT gauge types (Hearth — MONITOR pillar). Mirrors GET /v1/heartbeat,
// which projects ai-ops's heartbeat-sentinel feed into a clean wire shape (the raw-shape
// coupling lives in the server route). Read-only.
//
// The box-citizen's vital sign: each congress seat's context filling toward the 750K
// auto-compact gate. level=pctToGate, rate=burnPerTurn, ETA=etaMinToFire (same level+
// rate+ETA law as vram/disk). Honesty-spine: rate/eta are NULL when uncertain (just-
// booted / just-compacted / no-turn-advance) — render honest-null, never a fake number.
// gateState 'unreadable' = a seat whose transcript can't be read (render greyed).

export const HeartbeatSeatSchema = z.object({
    seat: z.string(),
    fill: z.number().nullable(),
    pctToGate: z.number().nullable(),
    gateState: z.string().nullable(),   // below-threshold | cooldown | seat-locked | FIRE | unreadable
    burnPerTurn: z.number().nullable(),  // tok/turn (level+RATE)
    etaMinToFire: z.number().nullable(), // min to autonomous /compact (honest-null when uncertain)
    inDangerZone: z.boolean(),           // pctToGate >= 0.85
    locked: z.boolean(),                 // seat-locked — won't fire mid-turn
    overdue: z.boolean(),                // recovery exhausted — the load-bearing danger
});

export const HeartbeatViewSchema = z.object({
    threshold: z.number().nullable(),    // the auto-compact gate (e.g. 750000)
    enrolledCount: z.number().nullable(),
    anyInDanger: z.boolean(),
    anyOverdue: z.boolean(),
    seats: z.array(HeartbeatSeatSchema),
});

export const HeartbeatResponseSchema = z.object({
    stale: z.boolean(),
    view: HeartbeatViewSchema.nullable(),
});

export type HeartbeatSeat = z.infer<typeof HeartbeatSeatSchema>;
export type HeartbeatView = z.infer<typeof HeartbeatViewSchema>;
export type HeartbeatResponse = z.infer<typeof HeartbeatResponseSchema>;
