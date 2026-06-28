import { z } from "zod";
import { Fastify } from "../types";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Warden route (Hearth — P1 RELATE layer, the knock-cards).
//
// Read-only projection of the for-carlos queue the Warden publishes to
// ~/.happy-selfhost/for-carlos.json. Each item is an ask the Warden (or another
// lane) left for Carlos — rendered client-side as a "knock-card" (a note a
// person left, never an alert). The client NEVER writes this file; the Warden
// owns it. Status data needs no encryption, so this is a plain authed REST GET,
// not the encrypted-entity socket pipeline. Same _recovery_mint file-read
// pattern as the congress roster route.
//
// Scope: this draft serves the asks (knock-cards). The honest-death pip + the
// watched-floor (warden-status.json) are a later slice and will extend this same
// route additively.

// One for-carlos item. Every field but id/from/q is optional at the read
// boundary — the file is script-written and re-read on a timer, so we normalize
// defensively and keep last good on failure.
const WardenItemSchema = z.object({
    id: z.string(),
    from: z.string(),
    q: z.string(),
    ts: z.string().nullish(),
    kind: z.string().nullish(),         // 'gate' (blocks) | 'routine' (optional)
    ctx: z.string().nullish(),          // the why / cascade
    ref: z.string().nullish(),          // quiet handle to the underlying thing
    a: z.string().nullish(),            // the answer, once given
    answered_ts: z.string().nullish(),
});

const ForCarlosFileSchema = z.object({
    items: z.array(WardenItemSchema),
});

function forCarlosPath(): string {
    const home = process.env.USERPROFILE || process.env.HOME || '';
    return join(home, '.happy-selfhost', 'for-carlos.json');
}

// Read + normalize the for-carlos queue. Defensive: absent / mid-write /
// malformed -> empty + stale, never throws. The client keeps last-good and
// retries on the next poll (never an error wall).
function readForCarlos(): { items: z.infer<typeof WardenItemSchema>[]; stale: boolean } {
    let raw: string;
    try {
        raw = readFileSync(forCarlosPath(), 'utf8');
    } catch {
        return { items: [], stale: true };
    }

    let json: unknown;
    try {
        json = JSON.parse(raw);
    } catch {
        return { items: [], stale: true };
    }

    // Accept the { items: [...] } envelope or a bare array of items.
    const candidate = Array.isArray(json) ? { items: json } : json;
    const parsed = ForCarlosFileSchema.safeParse(candidate);
    if (!parsed.success) {
        return { items: [], stale: true };
    }

    return { items: parsed.data.items, stale: false };
}

export function wardenRoutes(app: Fastify) {

    // GET /v1/warden — the for-carlos knock-card feed.
    app.get('/v1/warden', {
        schema: {
            response: {
                200: z.object({
                    stale: z.boolean(),
                    items: z.array(z.object({
                        id: z.string(),
                        from: z.string(),
                        q: z.string(),
                        ts: z.string().nullable(),
                        kind: z.string().nullable(),
                        ctx: z.string().nullable(),
                        ref: z.string().nullable(),
                        a: z.string().nullable(),
                        answered_ts: z.string().nullable(),
                    })),
                })
            }
        },
        preHandler: app.authenticate
    }, async (request, reply) => {
        const { items, stale } = readForCarlos();
        return reply.send({
            stale,
            items: items.map((i) => ({
                id: i.id,
                from: i.from,
                q: i.q,
                ts: i.ts ?? null,
                kind: i.kind ?? null,
                ctx: i.ctx ?? null,
                ref: i.ref ?? null,
                a: i.a ?? null,
                answered_ts: i.answered_ts ?? null,
            })),
        });
    });
}
