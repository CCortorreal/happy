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

// Task B (July-7 convergence, munder-building IA parity) — mirrors the server's
// congressRoutes.ts additions. cardCounts is honest-null today: Happy's
// seats-oracle has no work-item/tasks feed (only a message-queue `backlog`,
// which is a different signal) — the shape exists so the client can code
// against it now, and every row serves null until an oracle-side tasks feed
// lands to back it. tailPreview wraps the SAME bounded lastAssistantText
// signal as a single-entry `lines` array (the oracle emits no multi-line
// transcript today); honest-null when there's no text.
export const CongressCardCountsSchema = z.object({
    todo: z.number().nullable(),
    doing: z.number().nullable(),
    blocked: z.number().nullable(),
    done: z.number().nullable(),
});

export const CongressTailPreviewSchema = z.object({
    lines: z.array(z.string()),
    ts: z.number().nullable(),
    renderSafe: z.boolean().nullable(),
});

// Recursive-tier fields (2026-07-02, caged ai-ops design, vision check #6 —
// see docs/lane-happy-dev/schema-recursive-congress-seat.md). The seat graph
// is a tree: parent_seat_id === null marks a root (penthouse/top-level); every
// other seat resolves upward. Backward-compat is load-bearing — every new
// field has a default or is nullable so legacy flat-list payloads still parse
// and land as depth-0 roots.
//
// DEPTH computation choice: **write-time cache**. Whoever creates/updates a
// seat is responsible for setting `depth = parent.depth + 1` (or 0 if root)
// at the write site. The schema stores the cached value; readers trust it.
// Lazy-on-traversal was rejected — the roster is hot-read and cold-written,
// so paying the walk once per write beats paying it on every render. The
// compute itself is out of scope for this shift (schema-only); wiring lives
// in the reducer/oracle ripple that follows.
//
// ROLE is an enum but tolerant: unknown strings from a legacy payload coerce
// to 'unknown' via `.catch` so a stale server row doesn't fail the whole
// roster parse.
export const CongressSeatRoleSchema = z.enum([
    'penthouse',
    'floor-god',
    'worker',
    'desk',
    'warden',
    'porter',
    'unknown',
]).catch('unknown').default('unknown');

export const CongressSeatCageStatusSchema = z.enum([
    'sealed',
    'uncaged',
]).catch('uncaged').default('uncaged');

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
    role: CongressSeatRoleSchema,
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
    lastAssistantText: z.string().nullish(),  // raw latest-assistant-turn signal (oracle); voiced client-side
    lastTextTs: z.number().nullish(),         // R2: assistant-turn ts (epoch ms) — staleness fence for the thought
    renderSafe: z.boolean().nullish(),        // R3: privacy gate — voice raw text ONLY when true (fail-closed)
    // Fail-closed identity fence: the oracle sets this true when >1 session seat
    // shares one claudeSid (the spawn-stamp collision) and NULLS their transcript-
    // derived fields (contextFill/lastAssistantText). true -> render 'identity unverified'
    // (grey, no fill bar, no thought) instead of one seat's numbers on many tiles.
    joinCollision: z.boolean().nullish(),
    // Task B — per-lane work-item breakdown. Honest-null until an oracle-side
    // tasks feed exists (see schema comment above); never 0-as-fake. `.nullish()`
    // (not just `.nullable()`) so existing hand-built seat fixtures (e.g.
    // dev/hearth-preview.tsx) that predate this field stay additive/non-breaking.
    cardCounts: CongressCardCountsSchema.nullish(),
    // Task B — bounded live-output preview (see schema comment above). Same
    // `.nullish()` rationale as cardCounts.
    tailPreview: CongressTailPreviewSchema.nullish(),
    // Recursive-tier fields (see block comment above CongressSeatRoleSchema).
    // parent_seat_id: null = root (penthouse / top-level); any other value is
    // the `seat` of the parent. Legacy flat-list rows default to null, which
    // makes every pre-existing seat a depth-0 root until re-parented.
    parent_seat_id: z.string().nullable().default(null),
    // depth: write-time cache. 0 for roots, parent.depth + 1 otherwise. Not
    // validated at read time — the writer is trusted (see block comment).
    depth: z.number().default(0),
    // cage_status: 'sealed' seats resolve a concrete `cage_id`; 'uncaged'
    // seats have `cage_id === null`. Legacy rows default to 'uncaged'.
    cage_status: CongressSeatCageStatusSchema,
    // cage_id: null when uncaged. String when sealed (the cage the seat lives
    // in). Not cross-validated against cage_status in the schema — consistency
    // is a writer-side invariant.
    cage_id: z.string().nullable().default(null),
});

// Cycle guard for the recursive seat tree. Walk the parent chain from
// `parentId` upward through `allSeats`; if we encounter `seatId` anywhere in
// that chain, the write would create a cycle (a seat becoming its own
// transitive ancestor) and we throw. Callers use this at INSERT/UPDATE time
// BEFORE persisting a parent_seat_id change. Not wired into every write
// here — that ripple is scoped separately.
//
// Safety notes:
//   - `parentId === null` is trivially fine (root — no chain to walk).
//   - `parentId === seatId` is the degenerate self-parent case: caught on the
//     first step.
//   - A pre-existing cycle in `allSeats` (unrelated to this write) would loop
//     forever; we cap the walk with a visited set so a corrupt roster fails
//     loudly instead of hanging the caller.
export function assertNoCycle(
    seatId: string,
    parentId: string | null,
    allSeats: ReadonlyArray<{ seat: string; parent_seat_id?: string | null }>,
): void {
    if (parentId === null) return;
    const bySeat = new Map<string, string | null>();
    for (const s of allSeats) {
        bySeat.set(s.seat, s.parent_seat_id ?? null);
    }
    const visited = new Set<string>();
    let cursor: string | null = parentId;
    while (cursor !== null) {
        if (cursor === seatId) {
            throw new Error(
                `assertNoCycle: setting parent of "${seatId}" to "${parentId}" would create a cycle`,
            );
        }
        if (visited.has(cursor)) {
            throw new Error(
                `assertNoCycle: pre-existing cycle detected in roster while walking ancestors of "${seatId}" (revisited "${cursor}")`,
            );
        }
        visited.add(cursor);
        const next = bySeat.get(cursor);
        cursor = next === undefined ? null : next;
    }
}

export const CongressRosterResponseSchema = z.object({
    ts: z.number().nullable(),
    stale: z.boolean(),
    seats: z.array(CongressSeatSchema),
});

export type CongressHealth = z.infer<typeof CongressHealthSchema>;
export type CongressBottleneck = z.infer<typeof CongressBottleneckSchema>;
export type CongressCardCounts = z.infer<typeof CongressCardCountsSchema>;
export type CongressTailPreview = z.infer<typeof CongressTailPreviewSchema>;
export type CongressSeat = z.infer<typeof CongressSeatSchema>;
export type CongressRosterResponse = z.infer<typeof CongressRosterResponseSchema>;
