import { z } from "zod";
import { Fastify } from "../types";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Disk route (Hearth — MONITOR pillar, the resilience HUD). Read-only projection of
// the disk-sentinel feed (~/.happy-selfhost/disk-sentinel.json) into a clean wire
// shape for the cockpit. The device-health-raw-shape coupling lives HERE (one place)
// so the client/gauge never track its churn — same pattern as vramRoutes/congressRoutes.
//
// Tolerant at the read boundary (the ts-bug lesson): every field but the drive totals
// is nullish. Two honesty layers, kept DISTINCT:
//   - the WHOLE feed unreachable/too-old -> `stale: true` (the client's LOUD-guard).
//   - a single BOX the sentinel couldn't probe -> `reachable: false` + `reason` passed
//     through as DATA (the gauge renders "blind to this box", not a dead-whole-feed).
//
// Honest-staleness backstop (#170, same as vramRoutes): the file is rewritten on the
// sentinel's cadence; a too-old reading is reported stale rather than served fake-fresh.
// Disk changes slowly, so the window is generous (a few missed sentinel runs).
const STALE_AFTER_MS = 90 * 60 * 1000;

const RawDriveSchema = z.object({
    id: z.string(),
    role: z.string().nullish(),
    sizeGB: z.number().nullish(),
    usedGB: z.number().nullish(),
    freeGB: z.number().nullish(),
    pctUsed: z.number().nullish(),
    status: z.string().nullish(),           // green | warn | act
    alert: z.boolean().nullish(),
    fillRateGBPerDay: z.number().nullish(),  // level+RATE
    etaToActDays: z.number().nullish(),      // time-to-impact (honest-null when flat)
    note: z.string().nullish(),
});

const RawBoxSchema = z.object({
    box: z.string(),
    reachable: z.boolean().nullish(),
    reason: z.string().nullish(),           // WHY a box is unreachable (honest)
    ts: z.union([z.string(), z.number()]).nullish(),
    drives: z.array(RawDriveSchema).nullish(),
});

const DiskSentinelSchema = z.object({
    schema: z.number().nullish(),
    ts: z.union([z.string(), z.number()]).nullish(),
    thresholds: z.object({
        warn: z.number().nullish(),
        act: z.number().nullish(),
    }).nullish(),
    boxes: z.array(RawBoxSchema).nullish(),
});

function diskCandidatePaths(): string[] {
    const home = process.env.USERPROFILE || process.env.HOME || '';
    return [join(home, '.happy-selfhost', 'disk-sentinel.json')];
}

function readDisk(): { view: z.infer<typeof DiskSentinelSchema> | null; stale: boolean } {
    for (const path of diskCandidatePaths()) {
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
        const parsed = DiskSentinelSchema.safeParse(json);
        if (!parsed.success) {
            continue;
        }
        const tsRaw = parsed.data.ts;
        const ts = typeof tsRaw === 'number' ? tsRaw : (tsRaw ? Date.parse(tsRaw) || 0 : 0);
        // Age-gate (only when ts parses): a too-old reading is honest-stale, never fake-fresh.
        const ageStale = ts > 0 && (Date.now() - ts) > STALE_AFTER_MS;
        return { view: parsed.data, stale: ageStale };
    }
    return { view: null, stale: true };
}

export function diskRoutes(app: Fastify) {

    // GET /v1/disk — the cockpit disk-resilience gauge feed.
    app.get('/v1/disk', {
        schema: {
            response: {
                200: z.object({
                    stale: z.boolean(),
                    view: z.object({
                        thresholds: z.object({
                            warn: z.number().nullable(),
                            act: z.number().nullable(),
                        }),
                        boxes: z.array(z.object({
                            box: z.string(),
                            reachable: z.boolean(),
                            reason: z.string().nullable(),
                            drives: z.array(z.object({
                                id: z.string(),
                                role: z.string().nullable(),
                                sizeGB: z.number().nullable(),
                                usedGB: z.number().nullable(),
                                freeGB: z.number().nullable(),
                                pctUsed: z.number().nullable(),
                                status: z.string().nullable(),
                                fillRateGBPerDay: z.number().nullable(),
                                etaToActDays: z.number().nullable(),
                                note: z.string().nullable(),
                            })),
                        })),
                    }).nullable(),
                })
            }
        },
        preHandler: app.authenticate
    }, async (request, reply) => {
        const { view, stale } = readDisk();
        if (!view) {
            return reply.send({ stale, view: null });
        }
        return reply.send({
            stale,
            view: {
                thresholds: {
                    warn: view.thresholds?.warn ?? null,
                    act: view.thresholds?.act ?? null,
                },
                boxes: (view.boxes ?? []).map((b) => ({
                    box: b.box,
                    // Default reachable TRUE only when explicitly so; a missing flag with
                    // no drives reads as not-reachable (honest — we can't confirm it).
                    reachable: b.reachable ?? ((b.drives?.length ?? 0) > 0),
                    reason: b.reason ?? null,
                    drives: (b.drives ?? []).map((d) => ({
                        id: d.id,
                        role: d.role ?? null,
                        sizeGB: d.sizeGB ?? null,
                        usedGB: d.usedGB ?? null,
                        freeGB: d.freeGB ?? null,
                        pctUsed: d.pctUsed ?? null,
                        status: d.status ?? null,
                        fillRateGBPerDay: d.fillRateGBPerDay ?? null,
                        etaToActDays: d.etaToActDays ?? null,
                        note: d.note ?? null,
                    })),
                })),
            },
        });
    });
}
