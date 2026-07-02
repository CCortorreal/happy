import { z } from "zod";
import { Fastify } from "../types";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Backlog route (Hearth — MONITOR pillar, the queue-depth gauge). Read-only projection of
// the congress-roster feed (~/.happy-selfhost/congress-roster.json, ticked sub-minute by
// the oracle) into a clean wire shape for the cockpit BKLG gauge. The infra-raw-shape
// coupling lives HERE (one place) — same pattern as vramRoutes/diskRoutes/heartbeatRoutes.
//
// The roster carries a top-level `backlog` block (per infra commit 138552a):
//   { ts, backlog: { total, perSeat: [{ seat, count, oldestAgeSec }] } }
// We project ONLY that block — byte-compatible with the client's backlogTypes.ts. Every
// field is nullish at the read boundary (the ts-bug lesson: a too-strict schema silently
// emptied the roster for hours); a read/parse failure returns `stale: true` and the
// client's LOUD-guard keeps last-good and goes loud rather than serving a fake-fresh "0".
//
// Honest-staleness backstop (#170): the oracle rewrites the roster sub-minute, so a
// too-old reading is itself the oracle-dead signal — age-gate on the roster's own `ts`
// (generous enough for a few missed sub-minute ticks); older => stale.
const STALE_AFTER_MS = 5 * 60 * 1000;

const RawBacklogSeatSchema = z.object({
    seat: z.string(),
    count: z.number().nullish(),
    oldestAgeSec: z.number().nullish(),
});

const RawBacklogSchema = z.object({
    total: z.number().nullish(),
    perSeat: z.array(RawBacklogSeatSchema).nullish(),
});

// The roster file is a large document; we parse TOLERANTLY and pluck only the top-level
// `backlog` block plus `ts`. Everything else on the roster is ignored here (it's the
// congress/roster route's concern) so this gauge never tracks the roster's wider churn.
const RosterSchema = z.object({
    ts: z.union([z.string(), z.number()]).nullish(),
    backlog: RawBacklogSchema.nullish(),
});

function rosterPath(): string {
    const home = process.env.USERPROFILE || process.env.HOME || '';
    return join(home, '.happy-selfhost', 'congress-roster.json');
}

function readBacklog(): { view: z.infer<typeof RawBacklogSchema> | null; stale: boolean } {
    let raw: string;
    try {
        raw = readFileSync(rosterPath(), 'utf8');
    } catch {
        return { view: null, stale: true };
    }
    let json: unknown;
    try {
        json = JSON.parse(raw);
    } catch {
        return { view: null, stale: true };
    }
    const parsed = RosterSchema.safeParse(json);
    if (!parsed.success) {
        return { view: null, stale: true };
    }
    // A roster with no backlog block is honest-stale for THIS gauge — we can't confirm a
    // queue depth we were never handed (never a fake-fresh "0 queued").
    if (!parsed.data.backlog) {
        return { view: null, stale: true };
    }
    const tsRaw = parsed.data.ts;
    const ts = typeof tsRaw === 'number' ? tsRaw : (tsRaw ? Date.parse(tsRaw) || 0 : 0);
    // Age-gate (only when ts parses): a too-old reading is honest-stale, never fake-fresh.
    const ageStale = ts > 0 && (Date.now() - ts) > STALE_AFTER_MS;
    return { view: parsed.data.backlog, stale: ageStale };
}

export function backlogRoutes(app: Fastify) {

    // GET /v1/backlog — the cockpit BKLG (queue-depth) gauge feed.
    app.get('/v1/backlog', {
        schema: {
            response: {
                200: z.object({
                    stale: z.boolean(),
                    view: z.object({
                        total: z.number(),
                        perSeat: z.array(z.object({
                            seat: z.string(),
                            count: z.number(),
                            oldestAgeSec: z.number().nullable(),
                        })),
                    }).nullable(),
                })
            }
        },
        preHandler: app.authenticate
    }, async (request, reply) => {
        const { view, stale } = readBacklog();
        if (!view) {
            return reply.send({ stale, view: null });
        }
        return reply.send({
            stale,
            view: {
                total: view.total ?? 0,
                perSeat: (view.perSeat ?? []).map((s) => ({
                    seat: s.seat,
                    count: s.count ?? 0,
                    // oldestAgeSec is honest-null when a seat's backlog is empty (nothing
                    // to be old) — pass the null through verbatim, never coerce to 0.
                    oldestAgeSec: s.oldestAgeSec ?? null,
                })),
            },
        });
    });
}
