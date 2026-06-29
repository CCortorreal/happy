import { z } from "zod";
import { Fastify } from "../types";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// VRAM route (Hearth — MONITOR pillar). Read-only projection of device-health's
// ~/.happy-selfhost/vram-engine.json into a clean wire shape for the cockpit gauge.
// The device-health-raw-shape coupling lives HERE (one place) so the client/gauge
// never track its churn. Same _recovery_mint file-read pattern as the roster route.
//
// Tolerant at the read boundary (the ts-bug lesson — a too-strict schema silently
// emptied the roster for hours): every field but the gpu totals is nullish, and a
// read/parse failure returns stale (the LOUD-guard's loud state lives client-side).
//
// The `safeFree` block (allowlistResident / estFreedMB / orphanNote) is surfaced
// read-only; the side-effectful free ACTION is a separate guarded write-path
// (preview-then-confirm) wired once device-health's action contract lands.

const RawConsumerSchema = z.object({
    name: z.string(),
    pid: z.number().nullish(),
    vramMB: z.number(),
    // class vocab churned (never-touch|allowlist -> protected|orphan|reclaimable|
    // other); the projection maps TOLERANTLY across both so a future flip is safe.
    class: z.string().nullish(),
    neverTouch: z.boolean().nullish(),
    orphan: z.boolean().nullish(),      // authoritative dead-parent stale flag
});

const VramEngineSchema = z.object({
    schema: z.number().nullish(),
    ts: z.union([z.string(), z.number()]).nullish(),
    gpu: z.object({
        name: z.string().nullish(),
        totalMB: z.number(),
        usedMB: z.number(),
        freeMB: z.number(),
        tempC: z.number().nullish(),
        util: z.number().nullish(),
    }),
    headroom: z.object({
        targetMB: z.number().nullish(),
        loaded: z.boolean().nullish(),
        fits: z.boolean().nullish(),
        marginMB: z.number().nullish(),
        shortByMB: z.number().nullish(),
        // device-health's HONEST-FIT addendum: the authoritative 3-state band
        // (green=proven-fast / red=unambiguous-thrash / amber=uncertain), the
        // human why-string, and the raw spill signal. The gauge PAINTS by `state`.
        state: z.string().nullish(),
        stateBasis: z.string().nullish(),
        sharedSpillMB: z.number().nullish(),
        spilling: z.boolean().nullish(),
    }).nullish(),
    // Honest gen throughput (the anti-lying-green signal): tok/s + its own state +
    // freshness (worker saturation -> inconclusive, never a forced false reading).
    throughput: z.object({
        tokPerSec: z.number().nullish(),
        state: z.string().nullish(),
        fresh: z.boolean().nullish(),
        ageSec: z.number().nullish(),
    }).nullish(),
    processes: z.array(RawConsumerSchema).nullish(),
    // VRAM-pressure trend (level+RATE) — honest-null until warm (>=2 samples).
    pressure: z.object({
        usedMBPerMin: z.number().nullish(),
        basis: z.string().nullish(),
    }).nullish(),
    safeFree: z.object({
        estFreedMB: z.number().nullish(),
        orphanNote: z.string().nullish(),
    }).nullish(),
});

// Honest-staleness backstop (#170 — never render fake-fresh over a dead feed). The
// feed file is only rewritten when device-health's cadenced `status` runs; if that
// refresher ever dies, a successfully-PARSING but TEMPORALLY-OLD file would be served
// as `stale: false` = a lying-fresh gauge. So we age-gate on the file's own `ts`: a
// reading older than this is reported `stale: true` (the client's LOUD-guard then
// keeps last-good and goes loud), rather than a confident stale number. Generous
// enough to tolerate a few missed beats of device-health's ~1-2min cadence; only
// applied when `ts` is parseable (a feed with no usable timestamp can't be age-judged,
// so we serve it as-is and rely on the hard fetch/parse LOUD-guard instead).
const STALE_AFTER_MS = 5 * 60 * 1000;

// device-health flip-flopped the filename (vram-engine.json <-> vram-sentinel.json);
// rather than chase it, read BOTH candidates and use the freshest that parses —
// robust to whichever the engine settles on, and to a future rename.
function vramCandidatePaths(): string[] {
    const home = process.env.USERPROFILE || process.env.HOME || '';
    const dir = join(home, '.happy-selfhost');
    return [join(dir, 'vram-sentinel.json'), join(dir, 'vram-engine.json')];
}

function readVram(): { view: z.infer<typeof VramEngineSchema> | null; stale: boolean } {
    let best: { view: z.infer<typeof VramEngineSchema>; ts: number } | null = null;
    for (const path of vramCandidatePaths()) {
        let raw: string;
        try {
            raw = readFileSync(path, 'utf8');
        } catch {
            continue;
        }
        let json: unknown;
        try {
            json = JSON.parse(raw);
        } catch {
            continue;
        }
        const parsed = VramEngineSchema.safeParse(json);
        if (!parsed.success) {
            continue;
        }
        // Prefer the freshest by `ts` (ISO string or epoch); unparseable ts -> 0.
        const tsRaw = parsed.data.ts;
        const ts = typeof tsRaw === 'number' ? tsRaw : (tsRaw ? Date.parse(tsRaw) || 0 : 0);
        if (!best || ts > best.ts) {
            best = { view: parsed.data, ts };
        }
    }
    if (!best) {
        return { view: null, stale: true };
    }
    // Age-gate on the file's own ts (epoch ms; 0 = unparseable/absent -> can't judge
    // age, serve as-is). A too-old reading is honest-stale, never a lying-fresh number.
    const ageStale = best.ts > 0 && (Date.now() - best.ts) > STALE_AFTER_MS;
    return { view: best.view, stale: ageStale };
}

export function vramRoutes(app: Fastify) {

    // GET /v1/vram — the cockpit VRAM gauge feed.
    app.get('/v1/vram', {
        schema: {
            response: {
                200: z.object({
                    stale: z.boolean(),
                    view: z.object({
                        name: z.string().nullable(),
                        totalMB: z.number(),
                        usedMB: z.number(),
                        freeMB: z.number(),
                        tempC: z.number().nullable(),
                        util: z.number().nullable(),
                        headroom: z.object({
                            targetMB: z.number(),
                            loaded: z.boolean(),
                            fits: z.boolean(),
                            marginMB: z.number(),
                            shortByMB: z.number(),
                            state: z.string().nullable(),
                            stateBasis: z.string().nullable(),
                            sharedSpillMB: z.number().nullable(),
                        }).nullable(),
                        throughput: z.object({
                            tokPerSec: z.number().nullable(),
                            state: z.string().nullable(),
                            fresh: z.boolean(),
                        }).nullable(),
                        consumers: z.array(z.object({
                            name: z.string(),
                            pid: z.number().nullable(),
                            vramMB: z.number(),
                            locked: z.boolean(),
                            reclaimable: z.boolean(),
                            orphan: z.boolean(),
                        })),
                        reclaimableMB: z.number(),
                        orphanNote: z.string().nullable(),
                        pressureMBPerMin: z.number().nullable(),
                    }).nullable(),
                })
            }
        },
        preHandler: app.authenticate
    }, async (request, reply) => {
        const { view, stale } = readVram();
        if (!view) {
            return reply.send({ stale, view: null });
        }
        const h = view.headroom;
        return reply.send({
            stale,
            view: {
                name: view.gpu.name ?? null,
                totalMB: view.gpu.totalMB,
                usedMB: view.gpu.usedMB,
                freeMB: view.gpu.freeMB,
                tempC: view.gpu.tempC ?? null,
                util: view.gpu.util ?? null,
                headroom: h
                    ? {
                        targetMB: h.targetMB ?? 0,
                        loaded: h.loaded ?? false,
                        fits: h.fits ?? false,
                        marginMB: h.marginMB ?? 0,
                        shortByMB: h.shortByMB ?? 0,
                        state: h.state ?? null,
                        stateBasis: h.stateBasis ?? null,
                        sharedSpillMB: h.sharedSpillMB ?? null,
                    }
                    : null,
                throughput: view.throughput
                    ? {
                        tokPerSec: view.throughput.tokPerSec ?? null,
                        state: view.throughput.state ?? null,
                        fresh: view.throughput.fresh ?? false,
                    }
                    : null,
                consumers: (view.processes ?? []).map((p) => ({
                    name: p.name,
                    pid: p.pid ?? null,
                    vramMB: p.vramMB,
                    // TOLERANT across the class-vocab churn (protected|new + never-touch|old).
                    // locked = kept-by-design (structurally unfreeable).
                    locked: p.neverTouch === true || p.class === 'protected' || p.class === 'never-touch',
                    // reclaimable = the allowlist the safe-free action may close.
                    reclaimable: p.class === 'reclaimable' || p.class === 'allowlist',
                    // orphan = stale dead-parent (never auto-freed, but a Carlos-confirmed
                    // kill candidate — distinct from locked: never-freed for a DIFFERENT reason).
                    orphan: p.orphan === true || p.class === 'orphan',
                })),
                reclaimableMB: view.safeFree?.estFreedMB ?? 0,
                orphanNote: view.safeFree?.orphanNote ?? null,
                pressureMBPerMin: view.pressure?.usedMBPerMin ?? null,
            },
        });
    });
}
