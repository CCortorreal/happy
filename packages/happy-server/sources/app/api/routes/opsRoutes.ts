import { z } from "zod";
import { Fastify } from "../types";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// Ops route (Hearth — MONITOR pillar, the AI-ops spine's away-face). Read-only
// projection of the fleet-doctor's one-truth file (~/.happy-selfhost/ops-state.json,
// folded+written by ops-bus/fleet-doctor per the ai-ops-spine Wave A/C contract) into
// a clean wire shape. Same pattern as vramRoutes/diskRoutes/heartbeatRoutes: the
// raw-shape coupling lives HERE, one place, so the client never tracks its churn.
//
// Honest-staleness backstop: the doctor is cadenced every 5min (scheduled task); a
// too-old reading is stale rather than served fake-fresh. Age-gate at 6min (5min
// cadence + 1min grace). Prefer the file's own `ts` field; when absent/unparseable,
// fall back to the file's mtime (the ts-bug lesson — never let a missing field mean
// "assume fresh").
//
// Row-salvage: a single malformed alert entry (missing dedupe_key etc.) is dropped
// from the array rather than failing the whole parse — same discipline as
// congressRoutes' tolerant-row handling.
const STALE_AFTER_MS = 6 * 60 * 1000;

const RawAlertSchema = z.object({
    dedupe_key: z.string(),
    seat: z.string().nullish(),
    source: z.string().nullish(),
    class: z.string().nullish(),
    severity: z.string().nullish(),
    title: z.string().nullish(),
    detail: z.string().nullish(),
    count: z.number().nullish(),
    first_ts: z.union([z.string(), z.number()]).nullish(),
    last_ts: z.union([z.string(), z.number()]).nullish(),
    acked: z.boolean().nullish(),
    ttl_s: z.number().nullish(),
});

const RawVerdictSchema = z.object({
    name: z.string(),
    ok: z.boolean().nullish(),
    value: z.union([z.string(), z.number()]).nullish(),
    expect: z.string().nullish(),
    note: z.string().nullish(),
});

const RawBurnSeatSchema = z.object({
    seat: z.string(),
    usd: z.number().nullish(),
    cache_read_usd: z.number().nullish(),
    cache_write_usd: z.number().nullish(),
    output_usd: z.number().nullish(),
    turns: z.number().nullish(),
});

const OpsStateSchema = z.object({
    v: z.number().nullish(),
    ts: z.union([z.string(), z.number()]).nullish(),
    // Row-salvage: tolerate the whole array being absent/malformed; individual bad
    // rows are filtered in readOps() rather than failing safeParse wholesale.
    alerts: z.array(z.unknown()).nullish(),
    doctor: z.object({
        ran_at: z.union([z.string(), z.number()]).nullish(),
        verdicts: z.array(z.unknown()).nullish(),
    }).nullish(),
    burn: z.object({
        as_of: z.union([z.string(), z.number()]).nullish(),
        today: z.array(z.unknown()).nullish(),
    }).nullish(),
});

function opsStatePath(): string {
    return join(homedir(), '.happy-selfhost', 'ops-state.json');
}

function salvageAlerts(raw: unknown[] | null | undefined): z.infer<typeof RawAlertSchema>[] {
    if (!raw) return [];
    const out: z.infer<typeof RawAlertSchema>[] = [];
    for (const row of raw) {
        const parsed = RawAlertSchema.safeParse(row);
        if (parsed.success) {
            out.push(parsed.data);
        }
        // Malformed row dropped silently (salvage-the-rest, not fail-the-whole-feed).
    }
    return out;
}

function salvageVerdicts(raw: unknown[] | null | undefined): z.infer<typeof RawVerdictSchema>[] {
    if (!raw) return [];
    const out: z.infer<typeof RawVerdictSchema>[] = [];
    for (const row of raw) {
        const parsed = RawVerdictSchema.safeParse(row);
        if (parsed.success) {
            out.push(parsed.data);
        }
    }
    return out;
}

function salvageBurnSeats(raw: unknown[] | null | undefined): z.infer<typeof RawBurnSeatSchema>[] {
    if (!raw) return [];
    const out: z.infer<typeof RawBurnSeatSchema>[] = [];
    for (const row of raw) {
        const parsed = RawBurnSeatSchema.safeParse(row);
        if (parsed.success) {
            out.push(parsed.data);
        }
    }
    return out;
}

function readOps(): { view: z.infer<typeof OpsStateSchema> | null; stale: boolean } {
    const path = opsStatePath();
    let raw: string;
    try {
        raw = readFileSync(path, 'utf8');
    } catch {
        // Absent file -> absent-style response, never a 500.
        return { view: null, stale: true };
    }
    let json: unknown;
    try {
        json = JSON.parse(raw);
    } catch {
        return { view: null, stale: true };
    }
    const parsed = OpsStateSchema.safeParse(json);
    if (!parsed.success) {
        return { view: null, stale: true };
    }
    const tsRaw = parsed.data.ts;
    let ts = typeof tsRaw === 'number' ? tsRaw : (tsRaw ? Date.parse(tsRaw) || 0 : 0);
    if (!ts) {
        // ts missing/unparseable -> fall back to fs mtime (never assume fresh).
        try {
            ts = statSync(path).mtimeMs;
        } catch {
            ts = 0;
        }
    }
    const ageStale = ts > 0 ? (Date.now() - ts) > STALE_AFTER_MS : true;
    return { view: parsed.data, stale: ageStale };
}

export function opsRoutes(app: Fastify) {

    // GET /v1/ops — the away-face feed for the ai-ops spine's one truth file
    // (fleet-doctor verdicts + folded bus alerts + optional burn rollup).
    app.get('/v1/ops', {
        schema: {
            response: {
                200: z.object({
                    stale: z.boolean(),
                    view: z.object({
                        ts: z.string().nullable(),
                        alerts: z.array(z.object({
                            dedupe_key: z.string(),
                            seat: z.string().nullable(),
                            source: z.string().nullable(),
                            class: z.string().nullable(),
                            severity: z.string().nullable(),
                            title: z.string().nullable(),
                            detail: z.string().nullable(),
                            count: z.number().nullable(),
                            first_ts: z.string().nullable(),
                            last_ts: z.string().nullable(),
                            acked: z.boolean(),
                            ttl_s: z.number().nullable(),
                        })),
                        doctor: z.object({
                            ran_at: z.string().nullable(),
                            verdicts: z.array(z.object({
                                name: z.string(),
                                ok: z.boolean(),
                                value: z.string().nullable(),
                                expect: z.string().nullable(),
                                note: z.string().nullable(),
                            })),
                        }).nullable(),
                        burn: z.object({
                            as_of: z.string().nullable(),
                            today: z.array(z.object({
                                seat: z.string(),
                                usd: z.number().nullable(),
                                cache_read_usd: z.number().nullable(),
                                cache_write_usd: z.number().nullable(),
                                output_usd: z.number().nullable(),
                                turns: z.number().nullable(),
                            })),
                        }).nullable(),
                    }).nullable(),
                })
            }
        },
        preHandler: app.authenticate
    }, async (request, reply) => {
        const { view, stale } = readOps();
        if (!view) {
            return reply.send({ stale, view: null });
        }
        const tsRaw = view.ts;
        const tsStr = typeof tsRaw === 'number' ? new Date(tsRaw).toISOString() : (tsRaw ?? null);
        const ranAtRaw = view.doctor?.ran_at;
        const ranAtStr = typeof ranAtRaw === 'number' ? new Date(ranAtRaw).toISOString() : (ranAtRaw ?? null);
        const burnAsOfRaw = view.burn?.as_of;
        const burnAsOfStr = typeof burnAsOfRaw === 'number' ? new Date(burnAsOfRaw).toISOString() : (burnAsOfRaw ?? null);
        return reply.send({
            stale,
            view: {
                ts: tsStr,
                alerts: salvageAlerts(view.alerts).map((a) => {
                    const firstTs = typeof a.first_ts === 'number' ? new Date(a.first_ts).toISOString() : (a.first_ts ?? null);
                    const lastTs = typeof a.last_ts === 'number' ? new Date(a.last_ts).toISOString() : (a.last_ts ?? null);
                    return {
                        dedupe_key: a.dedupe_key,
                        seat: a.seat ?? null,
                        source: a.source ?? null,
                        class: a.class ?? null,
                        severity: a.severity ?? null,
                        title: a.title ?? null,
                        detail: a.detail ?? null,
                        count: a.count ?? null,
                        first_ts: firstTs,
                        last_ts: lastTs,
                        acked: a.acked ?? false,
                        ttl_s: a.ttl_s ?? null,
                    };
                }),
                doctor: view.doctor ? {
                    ran_at: ranAtStr,
                    verdicts: salvageVerdicts(view.doctor.verdicts).map((v) => ({
                        name: v.name,
                        ok: v.ok ?? false,
                        value: v.value !== undefined && v.value !== null ? String(v.value) : null,
                        expect: v.expect ?? null,
                        note: v.note ?? null,
                    })),
                } : null,
                burn: view.burn ? {
                    as_of: burnAsOfStr,
                    today: salvageBurnSeats(view.burn.today).map((s) => ({
                        seat: s.seat,
                        usd: s.usd ?? null,
                        cache_read_usd: s.cache_read_usd ?? null,
                        cache_write_usd: s.cache_write_usd ?? null,
                        output_usd: s.output_usd ?? null,
                        turns: s.turns ?? null,
                    })),
                } : null,
            },
        });
    });
}
