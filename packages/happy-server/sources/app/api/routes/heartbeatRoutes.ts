import { z } from "zod";
import { Fastify } from "../types";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Heartbeat route (Hearth — MONITOR pillar, the CONTEXT gauge). Read-only projection of
// ai-ops's heartbeat-sentinel feed (~/.happy-selfhost/heartbeat-sentinel.json, rewritten
// by the auto-compact organ every 30s) into a clean wire shape. The device-health/ai-ops
// raw-shape coupling lives HERE (one place) — same pattern as vramRoutes/diskRoutes.
//
// This is the box-citizen's vital sign: which congress seats are filling toward their
// 750K auto-compact gate (level=pctToGate, rate=burnPerTurn, ETA=etaMinToFire — the same
// level+rate+ETA law as vram/disk). Honesty-spine is baked at the SOURCE: rate/eta are
// NULL when uncertain (just-booted / just-compacted / no-turn-advance) — pass the nulls
// through verbatim, never coerce to a fake number. gateState 'unreadable' = a seat whose
// transcript can't be read (render greyed, not absent — the silent-dark-roster lesson).
//
// Honest-staleness backstop (#170): the organ ticks every 30s and daemonAlive is ALWAYS
// true inside the file, so freshness IS liveness — the feed going stale is itself the
// daemon-dead signal. Age-gate at 2.5min (tolerates a few missed beats); older => stale.
const STALE_AFTER_MS = 150 * 1000;

const RawSeatSchema = z.object({
    seat: z.string(),
    fill: z.number().nullish(),
    turns: z.number().nullish(),
    pctToGate: z.number().nullish(),
    gateState: z.string().nullish(),
    burnPerTurn: z.number().nullish(),
    turnsToFire: z.number().nullish(),
    etaMinToFire: z.number().nullish(),
    inDangerZone: z.boolean().nullish(),
    locked: z.boolean().nullish(),
    overdue: z.boolean().nullish(),
    lastFireTs: z.number().nullish(),
});

const HeartbeatSentinelSchema = z.object({
    schema: z.number().nullish(),
    ts: z.union([z.string(), z.number()]).nullish(),
    threshold: z.number().nullish(),
    enrolledCount: z.number().nullish(),
    anyInDanger: z.boolean().nullish(),
    anyOverdue: z.boolean().nullish(),
    overdueSeats: z.array(z.string()).nullish(),
    hottest: z.object({
        seat: z.string().nullish(),
        pctToGate: z.number().nullish(),
        fill: z.number().nullish(),
        etaMinToFire: z.number().nullish(),
    }).nullish(),
    seats: z.array(RawSeatSchema).nullish(),
});

function heartbeatPath(): string {
    const home = process.env.USERPROFILE || process.env.HOME || '';
    return join(home, '.happy-selfhost', 'heartbeat-sentinel.json');
}

function readHeartbeat(): { view: z.infer<typeof HeartbeatSentinelSchema> | null; stale: boolean } {
    let raw: string;
    try {
        raw = readFileSync(heartbeatPath(), 'utf8');
    } catch {
        return { view: null, stale: true };
    }
    let json: unknown;
    try {
        json = JSON.parse(raw);
    } catch {
        return { view: null, stale: true };
    }
    const parsed = HeartbeatSentinelSchema.safeParse(json);
    if (!parsed.success) {
        return { view: null, stale: true };
    }
    const tsRaw = parsed.data.ts;
    const ts = typeof tsRaw === 'number' ? tsRaw : (tsRaw ? Date.parse(tsRaw) || 0 : 0);
    // Freshness = liveness: a too-old reading is honest-stale (= the daemon-dead signal).
    const ageStale = ts > 0 && (Date.now() - ts) > STALE_AFTER_MS;
    return { view: parsed.data, stale: ageStale };
}

export function heartbeatRoutes(app: Fastify) {

    // GET /v1/heartbeat — the cockpit CONTEXT gauge feed (seats vs the auto-compact gate).
    app.get('/v1/heartbeat', {
        schema: {
            response: {
                200: z.object({
                    stale: z.boolean(),
                    view: z.object({
                        threshold: z.number().nullable(),
                        enrolledCount: z.number().nullable(),
                        anyInDanger: z.boolean(),
                        anyOverdue: z.boolean(),
                        seats: z.array(z.object({
                            seat: z.string(),
                            fill: z.number().nullable(),
                            pctToGate: z.number().nullable(),
                            gateState: z.string().nullable(),
                            burnPerTurn: z.number().nullable(),
                            etaMinToFire: z.number().nullable(),
                            inDangerZone: z.boolean(),
                            locked: z.boolean(),
                            overdue: z.boolean(),
                        })),
                    }).nullable(),
                })
            }
        },
        preHandler: app.authenticate
    }, async (request, reply) => {
        const { view, stale } = readHeartbeat();
        if (!view) {
            return reply.send({ stale, view: null });
        }
        return reply.send({
            stale,
            view: {
                threshold: view.threshold ?? null,
                enrolledCount: view.enrolledCount ?? null,
                anyInDanger: view.anyInDanger ?? false,
                anyOverdue: view.anyOverdue ?? false,
                seats: (view.seats ?? []).map((s) => ({
                    seat: s.seat,
                    fill: s.fill ?? null,
                    pctToGate: s.pctToGate ?? null,
                    gateState: s.gateState ?? null,
                    // Honesty-spine: rate/eta pass through as null when uncertain.
                    burnPerTurn: s.burnPerTurn ?? null,
                    etaMinToFire: s.etaMinToFire ?? null,
                    inDangerZone: s.inDangerZone ?? false,
                    locked: s.locked ?? false,
                    overdue: s.overdue ?? false,
                })),
            },
        });
    });
}
