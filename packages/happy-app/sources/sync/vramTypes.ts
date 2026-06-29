import { z } from 'zod';

// VRAM gauge types (Hearth — MONITOR pillar). Mirrors GET /v1/vram, which projects
// device-health's ~/.happy-selfhost/vram-engine.json into a clean wire shape (the
// device-health-raw-shape coupling lives in ONE place — the server route — so the
// gauge + client never track its churn). Read-only here; the side-effectful
// free-action (safeFree) is a separate guarded write-path (preview-then-confirm).
//
// 🔒 locked (class 'never-touch' — dwm/sunshine/llama-server/claude/the model: the
// engine structurally can't free these) vs ♻ reclaimable (class 'allowlist'). The
// orphan (a stale dead-parent llama-server) is never-touch-class = NEVER auto-freed;
// surfaced as a Carlos-confirmed-kill candidate only (honesty-spine: show clearly).

export const VramConsumerSchema = z.object({
    name: z.string(),
    pid: z.number().nullable(),
    vramMB: z.number(),
    locked: z.boolean(),        // protected — kept by design, structurally unfreeable
    reclaimable: z.boolean(),   // allowlist — safe-free can close it
    orphan: z.boolean(),        // stale dead-parent — never auto-freed, Carlos-confirmed-kill only
});

export const VramHeadroomSchema = z.object({
    targetMB: z.number(),           // the local model's need (qwen3 ~18384MiB)
    loaded: z.boolean(),            // is the model currently resident?
    fits: z.boolean(),              // free (or free-if-unloaded) >= target (size math)
    marginMB: z.number(),           // headroom when it fits (razor-thin when small)
    shortByMB: z.number(),          // the gap when it doesn't fit (0 otherwise)
    // device-health's HONEST-FIT band — the AUTHORITATIVE verdict (proven-fast vs
    // thrashing vs uncertain), NOT the lying size-math `fits`. Paint the gauge by
    // this when present; `stateBasis` is the human why. Nullish = pre-v2 feed -> the
    // gauge falls back to the razor-thin-margin proxy.
    state: z.string().nullish(),        // 'green' | 'amber' | 'red'
    stateBasis: z.string().nullish(),   // why that state, in words
    sharedSpillMB: z.number().nullish(),
});

// Honest gen throughput — the anti-lying-green signal (a model can read "loaded"
// while fetch-failing at ~0 tok/s). `inconclusive` under worker saturation = honest
// amber, never a forced reading.
export const VramThroughputSchema = z.object({
    tokPerSec: z.number().nullable(),
    state: z.string().nullable(),       // fast | slow | spilling | inconclusive | stale | not-loaded
    fresh: z.boolean(),
});

export const VramViewSchema = z.object({
    name: z.string().nullable(),    // GPU name (e.g. "RTX 3090")
    totalMB: z.number(),
    usedMB: z.number(),
    freeMB: z.number(),
    tempC: z.number().nullable(),
    util: z.number().nullable(),
    headroom: VramHeadroomSchema.nullable(),
    throughput: VramThroughputSchema.nullable(),
    consumers: z.array(VramConsumerSchema),
    reclaimableMB: z.number(),      // safeFree.estFreedMB — what a safe-free would free
    orphanNote: z.string().nullable(),  // the Carlos-gated stale-orphan reclaim note
    pressureMBPerMin: z.number().nullable(),  // VRAM-pressure trend (level+RATE); null = warming
});

// GET /v1/vram response: the view + the LOUD-guard `stale` (three-state feed
// discipline — a broken/unreadable engine file is NEVER a silent zero).
export const VramResponseSchema = z.object({
    stale: z.boolean(),
    view: VramViewSchema.nullable(),
});

export type VramConsumer = z.infer<typeof VramConsumerSchema>;
export type VramHeadroom = z.infer<typeof VramHeadroomSchema>;
export type VramThroughput = z.infer<typeof VramThroughputSchema>;
export type VramView = z.infer<typeof VramViewSchema>;
export type VramResponse = z.infer<typeof VramResponseSchema>;

export const gb = (mb: number) => (mb / 1024).toFixed(1) + 'GB';
