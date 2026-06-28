import { z } from "zod";
import { Fastify } from "../types";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Congress roster route (Hearth — Phase 0 plumbing).
//
// Read-only projection of the seats-oracle roster that infra publishes to
// ~/.happy-selfhost/congress-roster.json on each watch tick. The client JOINs
// these rows onto the sessions list by `cuid === session.id` and renders the
// oracle `verdict` as ground-truth liveness (NOT session.active, whose 15-min
// lastActiveAt TTL lies). The two invariants — JOIN key = cuid, verdict-over-
// active — are a LOCKED design contract (loom, 2026-06-28).
//
// The server never writes this file; it only reads it like _recovery_mint.ts
// reads ~/.happy-selfhost/. Status data needs no encryption, so this is a plain
// authed REST GET, not the encrypted-entity socket pipeline.

// One roster row as published by `seats-oracle --json`. Every field is optional
// at the read boundary except the load-bearing JOIN key; we normalize defensively
// because the file is script-written and re-read on a timer.
const CongressSeatSchema = z.object({
    seat: z.string(),
    cuid: z.string(),       // JOIN key → session.id (load-bearing, locked)
    verdict: z.string(),    // oracle liveness verdict → status (locked over session.active)
    role: z.string().nullish(),
    pedal: z.string().nullish(),
    host: z.string().nullish(),
    pid: z.number().nullish(),
});

// The oracle's native envelope key is `roster` (its name across the whole
// seats-oracle system — canonical per loom, contract-holder). We point at
// `roster` first and keep `seats` + bare-array as tolerant fallbacks. Each row
// may also carry an extra `cwd` field; Zod strips unknown keys, so it's ignored.
const CongressRosterFileSchema = z.object({
    ts: z.number().nullish(),
    roster: z.array(CongressSeatSchema).nullish(),
    seats: z.array(CongressSeatSchema).nullish(),
});

function rosterFilePath(): string {
    const home = process.env.USERPROFILE || process.env.HOME || '';
    return join(home, '.happy-selfhost', 'congress-roster.json');
}

// Read + normalize the roster file. Defensive: the file is published by an
// external process (the oracle) and may be mid-write, absent, or malformed.
// On any failure we return an empty roster marked `stale` rather than throwing —
// the client keeps last-good and simply retries on the next poll (never an error wall).
function readRoster(): { ts: number | null; seats: z.infer<typeof CongressSeatSchema>[]; stale: boolean } {
    let raw: string;
    try {
        raw = readFileSync(rosterFilePath(), 'utf8');
    } catch {
        return { ts: null, seats: [], stale: true };
    }

    let json: unknown;
    try {
        json = JSON.parse(raw);
    } catch {
        return { ts: null, seats: [], stale: true };
    }

    // Accept the canonical { ts, roster: [...] } envelope, the legacy { seats }
    // form, or a bare array of rows — normalize all three.
    const candidate = Array.isArray(json) ? { roster: json } : json;
    const parsed = CongressRosterFileSchema.safeParse(candidate);
    if (!parsed.success) {
        return { ts: null, seats: [], stale: true };
    }

    return {
        ts: parsed.data.ts ?? null,
        seats: parsed.data.roster ?? parsed.data.seats ?? [],
        stale: false,
    };
}

export function congressRoutes(app: Fastify) {

    // GET /v1/congress/roster — the Phase 0 enrichment feed.
    app.get('/v1/congress/roster', {
        schema: {
            response: {
                200: z.object({
                    ts: z.number().nullable(),
                    stale: z.boolean(),
                    seats: z.array(z.object({
                        seat: z.string(),
                        cuid: z.string(),
                        verdict: z.string(),
                        role: z.string().nullable(),
                        pedal: z.string().nullable(),
                        host: z.string().nullable(),
                        pid: z.number().nullable(),
                    })),
                })
            }
        },
        preHandler: app.authenticate
    }, async (request, reply) => {
        const { ts, seats, stale } = readRoster();
        return reply.send({
            ts,
            stale,
            seats: seats.map((s) => ({
                seat: s.seat,
                cuid: s.cuid,
                verdict: s.verdict,
                role: s.role ?? null,
                pedal: s.pedal ?? null,
                host: s.host ?? null,
                pid: s.pid ?? null,
            })),
        });
    });
}
