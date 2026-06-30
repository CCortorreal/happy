import { z } from "zod";
import { Fastify } from "../types";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

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
// Scope: PR-30 Slice 1 adds the honest-death pip's data source (GET /v1/warden/status,
// a thin passthrough of warden-status.json). The watched-floor RENDER (the checks as
// named status rooms) is still a later slice — this route exposes `checks` already
// since the file carries it for free, but Slice 1's client only consumes `ts`/`overall`.

// One for-carlos item. Every field but id/from/q is optional at the read
// boundary — the file is script-written and re-read on a timer, so we normalize
// defensively and keep last good on failure.
// Optional structured choices on a gate ask (loom's tap-a-choice). Additive: a
// lane (reaper's A/B first) populates it; absent -> client degrades to quick-reply.
const WardenChoiceSchema = z.object({
    key: z.string(),
    label: z.string(),
    recommended: z.boolean().nullish(),
});

// Optional structured commands on a terminal gate (Carlos's feedback; infra's
// for-carlos.mjs `ask --commands` producer). Additive mirror of choices[]: a lane
// authors {cmd, explain}; absent -> the operational wall stays prose behind the
// client's details-fold. Dark-safe until the producer lands.
const WardenCommandSchema = z.object({
    cmd: z.string(),
    explain: z.string().nullish(),
});

const WardenItemSchema = z.object({
    id: z.string(),
    from: z.string(),
    q: z.string(),
    ts: z.string().nullish(),
    kind: z.string().nullish(),         // 'gate' (blocks) | 'routine' (optional)
    ctx: z.string().nullish(),          // the why / cascade
    ref: z.string().nullish(),          // quiet handle to the underlying thing
    choices: z.array(WardenChoiceSchema).nullish(),
    commands: z.array(WardenCommandSchema).nullish(),
    a: z.string().nullish(),            // the answer, once given
    answered_ts: z.string().nullish(),
    // Withdraw/supersede (safety invariant: superseded != live). Set by the
    // for-carlos.mjs `withdraw` verb. Presence of withdrawn_ts => the card is no
    // longer answerable; superseded_by points at the replacement card's id.
    withdrawn_ts: z.string().nullish(),
    superseded_by: z.string().nullish(),
    withdraw_reason: z.string().nullish(),
    supersedes: z.string().nullish(),   // forward pointer on the LIVE winner card
    dependsOn: z.array(z.string()).nullish(),   // cascade edges (cards this is blocked on)
});

const ForCarlosFileSchema = z.object({
    items: z.array(WardenItemSchema),
});

function forCarlosPath(): string {
    const home = process.env.USERPROFILE || process.env.HOME || '';
    return join(home, '.happy-selfhost', 'for-carlos.json');
}

// The for-carlos.mjs organ is the SOLE writer of the queue (infra-confirmed). The
// server NEVER writes for-carlos.json directly — it routes the answer through the
// verb, which does read-modify-write + the channel route-back to the asking lane +
// the already-answered idempotency guard. Path is env-configurable for portability;
// the default matches the self-host box layout.
function forCarlosBin(): string {
    if (process.env.FOR_CARLOS_BIN) {
        return process.env.FOR_CARLOS_BIN;
    }
    const home = process.env.USERPROFILE || process.env.HOME || '';
    return join(home, 'Desktop', 'projects', '.claude', 'tools', 'congress-console', 'for-carlos.mjs');
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

// warden-status.json — the watch loop's heartbeat file (Hearth's honest-death pip
// source). GROUND TRUTH: warden-watch.mjs writes this NEXT TO ITSELF (its own script
// dir, .claude/tools/warden/), NOT under ~/.happy-selfhost/ like for-carlos.json — so
// this is intentionally a different path function. Env-overridable (same shape as
// FOR_CARLOS_BIN) so a non-default box layout can point elsewhere.
const WardenCheckSchema = z.object({
    status: z.string(),
    detail: z.string().nullish(),
});

const WardenStatusFileSchema = z.object({
    ts: z.string(),
    overall: z.string(),
    checks: z.record(z.string(), WardenCheckSchema).nullish(),
});

function wardenStatusPath(): string {
    if (process.env.WARDEN_STATUS_PATH) {
        return process.env.WARDEN_STATUS_PATH;
    }
    const home = process.env.USERPROFILE || process.env.HOME || '';
    return join(home, 'Desktop', 'projects', '.claude', 'tools', 'warden', 'warden-status.json');
}

// Read + normalize warden-status.json. Defensive like readForCarlos: absent / mid-
// write / malformed -> stale, never throws. CRITICAL: this function does NOT judge
// freshness by age — it only reports whether the file was readable/parseable. The
// honest-death pip's age judgment is a CLIENT-side computation against `ts` on the
// client's own clock (the design's load-bearing rule: never trust an "I'm alive"
// flag from the file, including an implicit one this route might compute itself).
function readWardenStatus(): { status: z.infer<typeof WardenStatusFileSchema> | null; stale: boolean } {
    let raw: string;
    try {
        raw = readFileSync(wardenStatusPath(), 'utf8');
    } catch {
        return { status: null, stale: true };
    }

    let json: unknown;
    try {
        json = JSON.parse(raw);
    } catch {
        return { status: null, stale: true };
    }

    const parsed = WardenStatusFileSchema.safeParse(json);
    if (!parsed.success) {
        return { status: null, stale: true };
    }

    return { status: parsed.data, stale: false };
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
                        choices: z.array(z.object({
                            key: z.string(),
                            label: z.string(),
                            recommended: z.boolean().nullable(),
                        })).nullable(),
                        commands: z.array(z.object({
                            cmd: z.string(),
                            explain: z.string().nullable(),
                        })).nullable(),
                        a: z.string().nullable(),
                        answered_ts: z.string().nullable(),
                        withdrawn_ts: z.string().nullable(),
                        superseded_by: z.string().nullable(),
                        withdraw_reason: z.string().nullable(),
                        supersedes: z.string().nullable(),
                        dependsOn: z.array(z.string()).nullable(),
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
                choices: i.choices?.map((c) => ({
                    key: c.key,
                    label: c.label,
                    recommended: c.recommended ?? null,
                })) ?? null,
                commands: i.commands?.map((c) => ({
                    cmd: c.cmd,
                    explain: c.explain ?? null,
                })) ?? null,
                a: i.a ?? null,
                answered_ts: i.answered_ts ?? null,
                withdrawn_ts: i.withdrawn_ts ?? null,
                superseded_by: i.superseded_by ?? null,
                withdraw_reason: i.withdraw_reason ?? null,
                supersedes: i.supersedes ?? null,
                dependsOn: i.dependsOn ?? null,
            })),
        });
    });

    // POST /v1/warden/answer — record Carlos's reply to a knock (the Hearth's first
    // WRITE). The client never touches the file; it routes here, and the server
    // shells the for-carlos.mjs answer verb (the sole writer). execFile with an arg
    // ARRAY — never a shell string — so the free-text answer can't inject a command.
    app.post('/v1/warden/answer', {
        schema: {
            body: z.object({
                id: z.string().min(1),
                answer: z.string().min(1).max(4000),
            }),
            response: {
                200: z.object({
                    ok: z.boolean(),
                    alreadyAnswered: z.boolean(),
                }),
                500: z.object({
                    ok: z.boolean(),
                    alreadyAnswered: z.boolean(),
                })
            }
        },
        preHandler: app.authenticate
    }, async (request, reply) => {
        const { id, answer } = request.body;
        try {
            // process.execPath (the absolute node binary this server already runs on),
            // NOT bare 'node' — a daemon-spawned server gets a minimal PATH without
            // C:\Program Files\nodejs, so execFile('node') silently ENOENT'd and the verb
            // never ran → every answer 500'd (the morning incident). execPath has zero
            // PATH dependency, so the answer verb launches regardless of how the server spawned.
            await execFileAsync(process.execPath, [forCarlosBin(), 'answer', id, answer], {
                timeout: 10000,
                env: { ...process.env, PEER_SEAT: 'carlos' },
            });
            return reply.send({ ok: true, alreadyAnswered: false });
        } catch (e: any) {
            // The verb exits non-zero when the item is already answered — that's a
            // benign double-submit (idempotent), not an error. Everything else is a
            // genuine failure the client should surface as "couldn't send — retry".
            const out = `${e?.stderr ?? ''}${e?.stdout ?? ''}${e?.message ?? ''}`;
            if (/already answered/i.test(out)) {
                return reply.send({ ok: true, alreadyAnswered: true });
            }
            // Never a silent 500 again — log the real cause (the morning's failure was invisible).
            request.log.error(
                { errMsg: e?.message, code: e?.code, stderr: e?.stderr, stdout: e?.stdout, bin: forCarlosBin() },
                'warden/answer execFile failed',
            );
            return reply.code(500).send({ ok: false, alreadyAnswered: false });
        }
    });

    // GET /v1/warden/status — the watch loop's heartbeat (the honest-death pip's data
    // source). Thin passthrough: this route makes NO freshness judgment — `stale` here
    // means only "the file was unreadable/unparseable", never "the ts looks old". The
    // client computes the pip's age band itself, every tick, off `ts` + its own clock.
    app.get('/v1/warden/status', {
        schema: {
            response: {
                200: z.object({
                    stale: z.boolean(),
                    ts: z.string().nullable(),
                    overall: z.string().nullable(),
                    checks: z.record(z.string(), z.object({
                        status: z.string(),
                        detail: z.string().nullable(),
                    })).nullable(),
                })
            }
        },
        preHandler: app.authenticate
    }, async (request, reply) => {
        const { status, stale } = readWardenStatus();
        return reply.send({
            stale,
            ts: status?.ts ?? null,
            overall: status?.overall ?? null,
            checks: status?.checks
                ? Object.fromEntries(Object.entries(status.checks).map(([k, v]) => [k, { status: v.status, detail: v.detail ?? null }]))
                : null,
        });
    });
}
