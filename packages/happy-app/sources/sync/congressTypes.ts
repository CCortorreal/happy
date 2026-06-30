import { z } from 'zod';

// Congress roster types (Hearth — Phase 0 plumbing).
//
// Mirrors the server's GET /v1/congress/roster response, which projects the
// seats-oracle roster published to ~/.happy-selfhost/congress-roster.json.
// The roster row shape { seat, cuid, verdict, role, pedal, host, pid } + ts is a
// LOCKED design contract (loom, 2026-06-28). The two invariants the client must
// honor: (1) JOIN key = cuid === session.id, (2) the oracle `verdict` is the
// status — NEVER session.active (its 15-min lastActiveAt TTL lies).

// Phase 1 OVERSEE — per-lane health decomposed into a magnitude + named causes
// (loom's moodlet model: '-context 78%', '+just compacted'). The oracle emits
// raw; the renderer maps score -> the red/amber/green/grey tile + lists causes on
// drill. Additive + dark-safe: absent -> the tile falls back to verdict alone.
export const CongressHealthSchema = z.object({
    score: z.number(),                       // weighted composite, oracle-defined
    causes: z.array(z.object({
        sign: z.string(),                    // '+' | '-'
        label: z.string(),                   // 'context 78%', '2 tool errors', 'just compacted'
        magnitude: z.number().nullish(),
    })).nullish(),
});

// Phase 1 OVERSEE — the directional Bottleneck light. `direction` localizes the
// fault: 'working' | 'blocked-downstream' (waiting on it consumed/answered) |
// 'starved-upstream' (no input). `approximate` flags the channel heuristic until a
// seat-declared block-state lands. Fail-closed: absent/unknown -> grey, not green.
export const CongressBottleneckSchema = z.object({
    direction: z.string(),
    approximate: z.boolean().nullish(),
});

export const CongressSeatSchema = z.object({
    seat: z.string(),
    // cuid = session.id for session rows (the JOIN key); null for worker rows
    // (a worker is watched, not conversable). Switch on `kind`, not cuid===null.
    cuid: z.string().nullable(),
    // claudeSid = transcript id (STABLE, daemon-independent). Primary JOIN key:
    // roster.claudeSid === session.metadata.claudeSessionId. cuid = fallback.
    claudeSid: z.string().nullish(),
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
    // contextFill = current context tokens → rendered as the OVERSEE "context %"
    // pressure cue (toward the 750K auto-compact fire). Dark-safe when absent.
    contextFill: z.number().nullish(),
    // Phase 1 OVERSEE (additive, dark-safe — present once infra's oracle emits).
    // The renderer voices `lastAssistantText`/`currentWork`/`pedal` into the
    // thought-line; `health` drives the tile color + causes; `bottleneck` the glyph.
    health: CongressHealthSchema.nullish(),
    bottleneck: CongressBottleneckSchema.nullish(),
    lastText: z.string().nullish(),  // raw latest-assistant-turn signal (oracle); voiced client-side
    // Fail-closed identity fence: the oracle sets this true when >1 session seat
    // shares one claudeSid (the spawn-stamp collision) and NULLS their transcript-
    // derived fields (contextFill/lastText). true -> render 'identity unverified'
    // (grey, no fill bar, no thought) instead of one seat's numbers on many tiles.
    joinCollision: z.boolean().nullish(),
});

export const CongressRosterResponseSchema = z.object({
    ts: z.number().nullable(),
    stale: z.boolean(),
    seats: z.array(CongressSeatSchema),
});

export type CongressHealth = z.infer<typeof CongressHealthSchema>;
export type CongressBottleneck = z.infer<typeof CongressBottleneckSchema>;
export type CongressSeat = z.infer<typeof CongressSeatSchema>;
export type CongressRosterResponse = z.infer<typeof CongressRosterResponseSchema>;
