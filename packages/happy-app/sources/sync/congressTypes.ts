import { z } from 'zod';

// Congress roster types (Hearth — Phase 0 plumbing).
//
// Mirrors the server's GET /v1/congress/roster response, which projects the
// seats-oracle roster published to ~/.happy-selfhost/congress-roster.json.
// The roster row shape { seat, cuid, verdict, role, pedal, host, pid } + ts is a
// LOCKED design contract (loom, 2026-06-28). The two invariants the client must
// honor: (1) JOIN key = cuid === session.id, (2) the oracle `verdict` is the
// status — NEVER session.active (its 15-min lastActiveAt TTL lies).

export const CongressSeatSchema = z.object({
    seat: z.string(),
    // cuid = session.id for session rows (the JOIN key); null for worker rows
    // (a worker is watched, not conversable). Switch on `kind`, not cuid===null.
    cuid: z.string().nullable(),
    verdict: z.string(),
    kind: z.string().nullable(),    // 'session' (default) | 'worker'
    role: z.string().nullable(),
    pedal: z.string().nullable(),
    host: z.string().nullable(),
    pid: z.number().nullable(),
    // Worker-row fields (kind === 'worker').
    model: z.string().nullable(),
    warm: z.boolean().nullable(),
    vramMB: z.number().nullable(),
    currentWork: z.string().nullable(),
    workStatus: z.string().nullable(),
    startedAt: z.string().nullable(),
});

export const CongressRosterResponseSchema = z.object({
    ts: z.number().nullable(),
    stale: z.boolean(),
    seats: z.array(CongressSeatSchema),
});

export type CongressSeat = z.infer<typeof CongressSeatSchema>;
export type CongressRosterResponse = z.infer<typeof CongressRosterResponseSchema>;
