import { z } from "zod";
import { Fastify } from "../types";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

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
// Phase 1 OVERSEE additions (additive, dark-safe): per-lane health (magnitude +
// named-cause moodlets), the directional bottleneck signal, and the raw
// last-assistant-text the renderer voices into the thought-line. ORACLE = raw
// signals; RENDERER = voicing — no phrasing here.
const CongressHealthSchema = z.object({
    score: z.number(),
    causes: z.array(z.object({
        sign: z.string(),
        label: z.string(),
        magnitude: z.number().nullish(),
    })).nullish(),
});
const CongressBottleneckSchema = z.object({
    direction: z.string(),
    approximate: z.boolean().nullish(),
});

// Task B (July-7 convergence, munder-building IA parity) — the two feeds the
// cockpit needs to match the building's per-lane tile: a bounded TAIL and a
// per-lane WORK-COUNTS breakdown.
//
// cardCounts: the building's tile reads {todo,doing,blocked,done} off
// hive/tasks.json via its warden/tasks projection. Happy's seats-oracle has NO
// equivalent today — grepped seats-oracle.mjs (peer-channel) end to end; it
// projects roster + a `backlog` block, and backlog is a MESSAGE-QUEUE signal
// (unacked mailbox count per seat), not a work-item lane breakdown. So this is
// wired honest-null: the schema/shape exists (additive, dark-safe) so the
// client can code against it now, but every row serves `cardCounts: null`
// until an oracle-side tasks feed exists to back it. NEVER 0-as-fake — 0 would
// claim "zero todos" when the truth is "no feed at all".
const CongressCardCountsSchema = z.object({
    todo: z.number().nullish(),
    doing: z.number().nullish(),
    blocked: z.number().nullish(),
    done: z.number().nullish(),
}).nullish();

// tailPreview: a bounded, honest-ts'd preview of the lane's live output, richer
// than the single-line lastAssistantText but still sourced from the SAME oracle
// signal (the oracle emits one whitespace-collapsed <=160-char string per tick,
// not a streaming multi-line transcript — grepped, no such feed exists). Rather
// than fabricate lines the oracle doesn't produce, tailPreview wraps that same
// bounded string as a single-entry `lines` array with its own ts, so the wire
// contract is ready for a future multi-line oracle emission (additive) without
// overclaiming one today. Bounded well under 8KB by construction (oracle already
// caps at 160 chars/line).
const CongressTailPreviewSchema = z.object({
    lines: z.array(z.string()),
    ts: z.union([z.string(), z.number()]).nullable(),
    renderSafe: z.boolean().nullable(),
}).nullish();

const CongressSeatSchema = z.object({
    seat: z.string(),
    // JOIN key → session.id for session rows; NULL for worker rows (a worker is
    // watched, not a conversable session). Switch on `kind`, not on cuid===null.
    cuid: z.string().nullable(),
    // claudeSid = the transcript/Claude session id — STABLE + daemon-independent
    // (survives daemon restarts that churn cuid). The robust JOIN key: roster
    // claudeSid === session.metadata.claudeSessionId. cuid stays as a fallback.
    claudeSid: z.string().nullish(),
    verdict: z.string(),    // oracle liveness verdict → status (locked over session.active)
    kind: z.string().nullish(),     // 'session' (default) | 'worker'
    role: z.string().nullish(),
    pedal: z.string().nullish(),
    host: z.string().nullish(),
    pid: z.number().nullish(),
    // Worker-row fields (kind === 'worker') — a pull-worker brain on the cheap tier.
    model: z.string().nullish(),
    warm: z.boolean().nullish(),
    vramMB: z.number().nullish(),
    currentWork: z.string().nullish(),
    workStatus: z.string().nullish(),
    startedAt: z.union([z.string(), z.number()]).nullish(),
    // contextFill = the lane's current context tokens (the oracle already emits it).
    // Surfaced as the OVERSEE "context %" pressure cue (toward the 750K auto-compact
    // fire). The first MONITOR signal on the tile.
    contextFill: z.number().nullish(),
    // Phase 1 OVERSEE (dark-safe until the oracle emits).
    health: CongressHealthSchema.nullish(),
    bottleneck: CongressBottleneckSchema.nullish(),
    // lastAssistantText = the lane's latest assistant turn (oracle: whitespace-collapsed,
    // <=160 chars, null when the last turn was pure tool_use). RAW signal — the
    // client voices it. joinCollision = the oracle's fail-closed flag: >1 session
    // seat sharing one claudeSid -> every transcript-derived field (contextFill/
    // lastAssistantText) is nulled for all of them and this is set true, so the cockpit
    // renders 'identity unverified' instead of one seat's number on many tiles.
    lastAssistantText: z.string().nullish(),
    // ts = the assistant-turn timestamp for lastAssistantText (oracle emits ISO).
    // Drives R2 honest-staleness in the thought-line (age/grey a stale thought).
    ts: z.union([z.string(), z.number()]).nullish(),
    // renderSafe = the oracle's allowlist-derived privacy gate. Render raw
    // lastAssistantText ONLY when true; absent/false => redact (fail-closed).
    renderSafe: z.boolean().nullish(),
    joinCollision: z.boolean().nullish(),
    // Tolerant passthrough slots: the oracle does not emit these YET (see the
    // schema comments above), but if/when it does, the raw parse already
    // accepts them under the row's native field names so no schema churn is
    // needed on that day — only the mapping below has to start reading them.
    cardCounts: CongressCardCountsSchema,
    tailPreview: CongressTailPreviewSchema,
    // Recursive-tier fields (2026-07-02, caged ai-ops design — see
    // docs/lane-happy-dev/schema-recursive-congress-seat.md). The oracle does
    // not emit these yet (tolerant passthrough, same shape as cardCounts/
    // tailPreview above); the server-side caged-congress merge below is the
    // first real producer. Absent -> the mapping below defaults every legacy
    // oracle row to a depth-0, uncaged root — additive + backward-compatible,
    // mirrors the client's congressTypes.ts schema defaults exactly so
    // nothing diverges. `role` (already declared above) doubles as the
    // recursive-tier role slot — the client's CongressSeatRoleSchema widens
    // the SAME field tolerantly (unknown strings -> 'unknown'), so no
    // parallel role_v2 field is introduced here.
    parent_seat_id: z.string().nullish(),
    depth: z.number().nullish(),
    cage_status: z.string().nullish(),
    cage_id: z.string().nullish(),
});

// The oracle's native envelope key is `roster` (its name across the whole
// seats-oracle system — canonical per loom, contract-holder). We point at
// `roster` first and keep `seats` + bare-array as tolerant fallbacks. Each row
// may also carry an extra `cwd` field; Zod strips unknown keys, so it's ignored.
const CongressRosterFileSchema = z.object({
    // The oracle emits `ts` as an ISO STRING (it switched from epoch); accept both
    // so the whole-file parse never fails on it (a number-only schema here was
    // silently emptying the entire roster -> the live Hearthside never formed).
    ts: z.union([z.string(), z.number()]).nullish(),
    // Rows are parsed INDIVIDUALLY in readRoster (z.unknown here), not as
    // z.array(CongressSeatSchema): with the array-typed schema, ONE malformed
    // row failed the whole-file safeParse and collapsed the entire roster to
    // stale-empty — the 2026-07-02 dark-roster root cause (the oracle published
    // two anonymous session rows with seat:null and every real seat vanished
    // from the surface). Same lesson as the seat-file reader below: one bad
    // row must not drop the rest.
    roster: z.array(z.unknown()).nullish(),
    seats: z.array(z.unknown()).nullish(),
});

// Normalize the oracle `ts` (ISO string or epoch number) to epoch ms for the
// number-typed wire contract; unparseable -> null (honest staleness).
function normalizeTs(ts: string | number | null | undefined): number | null {
    if (ts == null) return null;
    if (typeof ts === 'number') return ts;
    const parsed = Date.parse(ts);
    return Number.isFinite(parsed) ? parsed : null;
}

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

    // Row-level salvage: parse each row on its own so one malformed row (e.g.
    // the oracle's anonymous seat:null session rows) drops JUST that row, never
    // the whole roster. If rows were present but NONE parsed, that's a broken
    // feed — honest-stale so the client keeps last-good; an actually-empty
    // roster stays a fresh empty roster.
    const rows = parsed.data.roster ?? parsed.data.seats ?? [];
    const seats: z.infer<typeof CongressSeatSchema>[] = [];
    for (const row of rows) {
        const rowParsed = CongressSeatSchema.safeParse(row);
        if (!rowParsed.success) continue;
        seats.push(rowParsed.data);
    }
    return {
        ts: normalizeTs(parsed.data.ts),
        seats,
        stale: rows.length > 0 && seats.length === 0,
    };
}

// ---- caged-congress merge (2026-07-02, host-bridge protocol pattern) ----
//
// The seats-oracle roster (readRoster above) only ever sees the HOST's own
// registered seats — it has no visibility into the sealed cage (cage:mvf),
// which lives inside WSL and is intentionally airlocked from the host process
// tree. Per docs/lane-happy-dev/host-bridge-protocol.md §4 (recursive-schema
// mapping) and docs/lane-happy-dev/schema-recursive-congress-seat.md, this
// merge is a STOPGAP substitute for the not-yet-built host-bridge systemd
// service: rather than wait for that service to sync cage state to Vesta over
// the mesh, the server does a direct read-only WSL peek on every roster
// request (cheap: a handful of small `cat`s), synthesizes a `cage-root`
// penthouse seat per the protocol doc, and parents the real caged seats under
// it. When the host-bridge service lands, this function is the natural
// replacement target — same output shape, different transport.
//
// HARD RULE (bright-line, cage seal): read-only. Never docker exec, never
// iptables/DOCKER-USER, never write into /root/cage-mvf. Only `cat` of the
// seat JSON + beat/claim files, exactly like the mission's read-only recon
// commands.

type MergedSeat = z.infer<typeof CongressSeatSchema>;

const CAGE_ID = 'cage-mvf';
const CAGE_ROOT_SEAT_ID = 'cage-root';
// Bridge-host-seat placeholder: the host-bridge protocol doc's ideal chain is
// "Vesta root -> host-bridge seat -> cage-root -> caged seats", but the
// systemd bridge service doesn't exist yet (open gap #1 in the protocol doc).
// Until it does, cage-root has no real bridge seat to parent under, so it
// parents to null (top-level) rather than fabricate a bridge seat that isn't
// actually running. Revisit when the bridge service ships.
const CAGE_ROOT_PARENT_SEAT_ID: string | null = null;

const CagedSeatFileSchema = z.object({
    seat: z.string(),
    cuid: z.string().nullish(),
    hostPid: z.number().nullish(),
    registeredAt: z.string().nullish(),
    role: z.string().nullish(),
    pedal: z.string().nullish(),
    cwd: z.string().nullish(),
    host: z.string().nullish(),
    claudeSid: z.string().nullish(),
});

// Known caged worker roles (per the mission's recon: overseer, ai-ops, aegis)
// map cleanly onto the recursive role enum's 'worker' tier. Anything else
// (a caged seat file we don't recognize) is honestly 'unknown' rather than
// guessed — never fabricate a role.
const KNOWN_CAGED_WORKER_SEATS = new Set(['overseer', 'ai-ops', 'aegis']);

function homeDir(): string {
    return process.env.USERPROFILE || process.env.HOME || '';
}

// Host UNCAGED seats: ~/.claude/peer-channel/state/seats/*.json — the same
// registered-seat files seats-oracle.mjs reads (see recon), read directly
// here since the merge needs their `role` re-mapped onto the recursive enum
// (the oracle's flat `role` passthrough is a free-text label like "aegis",
// not the tree enum). Read-only; the server never writes these.
function readHostSeats(): MergedSeat[] {
    const dir = join(homeDir(), '.claude', 'peer-channel', 'state', 'seats');
    let files: string[];
    try {
        files = readdirSync(dir).filter((f) => f.endsWith('.json'));
    } catch {
        return []; // dir absent/unreadable -> omit gracefully, never fabricate
    }
    const seats: MergedSeat[] = [];
    for (const f of files) {
        let raw: string;
        try {
            raw = readFileSync(join(dir, f), 'utf8');
        } catch {
            continue; // one bad file must not drop the rest
        }
        let json: unknown;
        try {
            json = JSON.parse(raw);
        } catch {
            continue;
        }
        const parsed = CagedSeatFileSchema.safeParse(json);
        if (!parsed.success) continue;
        const rec = parsed.data;
        // role mapping (mission spec): desk -> 'desk'; anything else we can't
        // honestly classify -> 'unknown'. Never guess a tier for a host seat
        // we don't recognize.
        const role = rec.seat === 'desk' ? 'desk' : 'unknown';
        seats.push(mergedSeat({
            seat: rec.seat,
            cuid: rec.cuid ?? null,
            claudeSid: rec.claudeSid ?? null,
            verdict: 'unverified', // host-seat liveness is the oracle's job, not this merge's — never re-derive it here
            kind: 'session',
            role,
            pedal: rec.pedal ?? null,
            host: rec.host ?? null,
            pid: rec.hostPid ?? null,
            parent_seat_id: null, // host seats are top-level in this merge (the oracle roster already carries the real ones; this is the honest-unknown fallback slice)
            depth: 0,
            cage_status: 'uncaged',
            cage_id: null,
        }));
    }
    return seats;
}

// Read-only WSL peek at the sealed cage's seat state. Cage seal discipline:
// ONLY `cat`, never `docker exec`/`iptables`/writes. Any failure (WSL not
// installed, distro not running, path missing, timeout) degrades to an empty
// list — the roster stays honest (omit caged seats) rather than fabricate
// liveness or seats. Every WSL call is a separate `cat` (no shell glob/loop
// inside the WSL command — those were observed to mangle badly through the
// wsl.exe quoting layer during recon; one file per call is the reliable shape).
const WSL_TIMEOUT_MS = 4000;
const CAGE_SEATS_BASE = '/root/cage-mvf/peer-channel/state/seats';
const CAGED_SEAT_NAMES = ['overseer', 'ai-ops', 'aegis'] as const;

async function wslCat(path: string): Promise<string | null> {
    try {
        const { stdout } = await execFileAsync('wsl', ['-d', 'Ubuntu', '-u', 'root', '--', 'cat', path], {
            timeout: WSL_TIMEOUT_MS,
        });
        return stdout;
    } catch {
        return null; // unreadable/absent/WSL-down -> honest omission, never a fabricated value
    }
}

async function readCagedCongress(): Promise<MergedSeat[]> {
    // Probe the cage-root's own seat file first (proves WSL + the cage mount
    // are reachable at all) before paying the cost of N more WSL calls.
    const desk = await wslCat(`${CAGE_SEATS_BASE}/desk.json`);
    if (desk == null) return []; // WSL unreachable -> omit the whole caged slice gracefully

    const seats: MergedSeat[] = [];
    // cage-root: synthetic penthouse seat per host-bridge-protocol.md §4.
    // Not backed by a real seat file — it represents the cage boundary itself.
    seats.push(mergedSeat({
        seat: CAGE_ROOT_SEAT_ID,
        cuid: null,
        claudeSid: null,
        verdict: 'sealed', // not a liveness verdict in the oracle sense — the cage boundary is definitionally "sealed", never re-derived
        kind: 'worker',
        role: 'penthouse',
        pedal: null,
        host: null,
        pid: null,
        parent_seat_id: CAGE_ROOT_PARENT_SEAT_ID,
        depth: 0,
        cage_status: 'sealed',
        cage_id: CAGE_ID,
    }));

    for (const name of CAGED_SEAT_NAMES) {
        const raw = await wslCat(`${CAGE_SEATS_BASE}/${name}.json`);
        if (raw == null) continue; // this one seat unreadable -> drop just it, keep the rest honest
        let json: unknown;
        try {
            json = JSON.parse(raw);
        } catch {
            continue;
        }
        const parsed = CagedSeatFileSchema.safeParse(json);
        if (!parsed.success) continue;
        const rec = parsed.data;
        // Freshness: derive from the seat's own beat.ts (nanosecond epoch,
        // confirmed via recon) when readable; never invent a value when it
        // isn't. beat.ts absence doesn't drop the seat — it just means no
        // freshness signal beyond registeredAt.
        const beatRaw = await wslCat(`${CAGE_SEATS_BASE}/${name}/beat.ts`);
        const beatMs = beatRaw != null && /^\d+$/.test(beatRaw.trim())
            ? Math.round(Number(beatRaw.trim()) / 1e6) // ns -> ms
            : null;
        // role: mission-specified default is 'worker' unless the seat's own
        // JSON says otherwise. None of the known caged seat JSON files carry
        // a recursive-tier role today (recon confirmed: role field mirrors
        // the seat name, e.g. "overseer"), so the honest read is 'worker' for
        // every KNOWN_CAGED_WORKER_SEATS entry, 'unknown' for anything else.
        const role = KNOWN_CAGED_WORKER_SEATS.has(name) ? 'worker' : 'unknown';
        // Namespace the seat id (`cage-mvf:overseer`, not bare `overseer`): the
        // caged copy of a seat file and the identically-named HOST seat (the
        // oracle roster already carries a flat `overseer`/`ai-ops`/`aegis` row
        // for the host-side Claude Code session) are genuinely different
        // entities sharing a name. A bare id would collide in mergeCongress's
        // seat-id dedup and silently drop the caged row entirely.
        seats.push(mergedSeat({
            seat: `${CAGE_ID}:${rec.seat || name}`,
            cuid: rec.cuid ?? null,
            claudeSid: rec.claudeSid ?? null,
            // Cage seal means this process can't independently verify pid
            // liveness inside the cage's own namespace — 'sealed' is the
            // honest verdict (not 'alive'/'dead', which would be a guess).
            verdict: 'sealed',
            kind: 'session',
            role,
            pedal: rec.pedal ?? null,
            host: rec.host ?? null,
            pid: rec.hostPid ?? null,
            parent_seat_id: CAGE_ROOT_SEAT_ID,
            depth: 1,
            cage_status: 'sealed',
            cage_id: CAGE_ID,
            startedAt: beatMs != null ? String(beatMs) : (rec.registeredAt ?? null),
        }));
    }
    return seats;
}

// Build a full MergedSeat (CongressSeatSchema-shaped) from a partial set of
// overrides, filling every other field with its honest-null default. Keeps
// the two producers above from having to restate the full seat shape.
function mergedSeat(overrides: Partial<MergedSeat> & { seat: string }): MergedSeat {
    return {
        seat: overrides.seat,
        cuid: overrides.cuid ?? null,
        claudeSid: overrides.claudeSid ?? null,
        verdict: overrides.verdict ?? 'unverified',
        kind: overrides.kind ?? null,
        role: overrides.role ?? null,
        pedal: overrides.pedal ?? null,
        host: overrides.host ?? null,
        pid: overrides.pid ?? null,
        model: overrides.model ?? null,
        warm: overrides.warm ?? null,
        vramMB: overrides.vramMB ?? null,
        currentWork: overrides.currentWork ?? null,
        workStatus: overrides.workStatus ?? null,
        startedAt: overrides.startedAt ?? null,
        contextFill: overrides.contextFill ?? null,
        health: overrides.health ?? null,
        bottleneck: overrides.bottleneck ?? null,
        lastAssistantText: overrides.lastAssistantText ?? null,
        ts: overrides.ts ?? null,
        renderSafe: overrides.renderSafe ?? null,
        joinCollision: overrides.joinCollision ?? null,
        cardCounts: overrides.cardCounts ?? null,
        tailPreview: overrides.tailPreview ?? null,
        parent_seat_id: overrides.parent_seat_id ?? null,
        depth: overrides.depth ?? 0,
        cage_status: overrides.cage_status ?? 'uncaged',
        cage_id: overrides.cage_id ?? null,
    };
}

// Merge the oracle's flat roster with the host-uncaged slice + the caged
// congress. Additive only: existing oracle rows are never dropped or
// mutated. Dedup key is `seat` (a seat already present in the oracle roster
// wins — the oracle is the richer, verdict-derived source; the host/caged
// readers here only fill in seats the oracle doesn't already carry, e.g. the
// caged seats it structurally cannot see through the airlock).
async function mergeCongress(oracleSeats: MergedSeat[]): Promise<MergedSeat[]> {
    const seen = new Set(oracleSeats.map((s) => s.seat));
    const merged = [...oracleSeats];

    for (const s of readHostSeats()) {
        if (seen.has(s.seat)) continue;
        seen.add(s.seat);
        merged.push(s);
    }

    // WSL read is the one truly fallible step (external process, cage may be
    // sealed/stopped/absent) — isolate its failure so it can never take down
    // the rest of the merge or the route.
    let caged: MergedSeat[] = [];
    try {
        caged = await readCagedCongress();
    } catch {
        caged = []; // omit gracefully — never fabricate the caged slice
    }
    for (const s of caged) {
        if (seen.has(s.seat)) continue;
        seen.add(s.seat);
        merged.push(s);
    }

    return merged;
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
                        cuid: z.string().nullable(),
                        claudeSid: z.string().nullable(),
                        verdict: z.string(),
                        kind: z.string().nullable(),
                        role: z.string().nullable(),
                        pedal: z.string().nullable(),
                        host: z.string().nullable(),
                        pid: z.number().nullable(),
                        model: z.string().nullable(),
                        warm: z.boolean().nullable(),
                        vramMB: z.number().nullable(),
                        currentWork: z.string().nullable(),
                        workStatus: z.string().nullable(),
                        startedAt: z.string().nullable(),
                        contextFill: z.number().nullable(),
                        health: z.object({
                            score: z.number(),
                            causes: z.array(z.object({
                                sign: z.string(),
                                label: z.string(),
                                magnitude: z.number().nullable(),
                            })).nullable(),
                        }).nullable(),
                        bottleneck: z.object({
                            direction: z.string(),
                            approximate: z.boolean().nullable(),
                        }).nullable(),
                        lastAssistantText: z.string().nullable(),
                        lastTextTs: z.number().nullable(),
                        renderSafe: z.boolean().nullable(),
                        joinCollision: z.boolean().nullable(),
                        // Task B additions (additive, honest-null — see schema comments above).
                        cardCounts: z.object({
                            todo: z.number().nullable(),
                            doing: z.number().nullable(),
                            blocked: z.number().nullable(),
                            done: z.number().nullable(),
                        }).nullable(),
                        tailPreview: z.object({
                            lines: z.array(z.string()),
                            ts: z.number().nullable(),
                            renderSafe: z.boolean().nullable(),
                        }).nullable(),
                        // Recursive-tier fields (2026-07-02, caged ai-ops design — see
                        // docs/lane-happy-dev/schema-recursive-congress-seat.md). Mirrors
                        // congressTypes.ts's CongressSeatSchema exactly. Every legacy oracle
                        // row defaults to a depth-0, uncaged root; the caged-congress merge
                        // below is the first real producer of non-default values.
                        parent_seat_id: z.string().nullable(),
                        depth: z.number(),
                        cage_status: z.string(),
                        cage_id: z.string().nullable(),
                    })),
                })
            }
        },
        preHandler: app.authenticate
    }, async (request, reply) => {
        const { ts, seats: oracleSeats, stale } = readRoster();
        // Merge the host-uncaged slice + the sealed cage (read-only WSL peek,
        // see readCagedCongress above) onto the oracle's flat roster. Both
        // congresses surface in ONE response — the client's useCongressTree
        // hydrates the parent_seat_id edges into the tree.
        const seats = await mergeCongress(oracleSeats);
        return reply.send({
            ts,
            stale,
            seats: seats.map((s) => ({
                seat: s.seat,
                cuid: s.cuid,
                claudeSid: s.claudeSid ?? null,
                verdict: s.verdict,
                kind: s.kind ?? null,
                role: s.role ?? null,
                pedal: s.pedal ?? null,
                host: s.host ?? null,
                pid: s.pid ?? null,
                model: s.model ?? null,
                warm: s.warm ?? null,
                vramMB: s.vramMB ?? null,
                currentWork: s.currentWork ?? null,
                workStatus: s.workStatus ?? null,
                // Normalize startedAt (may be ISO string or epoch number) to a string.
                startedAt: s.startedAt == null ? null : String(s.startedAt),
                contextFill: s.contextFill ?? null,
                health: s.health
                    ? {
                        score: s.health.score,
                        causes: s.health.causes?.map((c) => ({
                            sign: c.sign,
                            label: c.label,
                            magnitude: c.magnitude ?? null,
                        })) ?? null,
                    }
                    : null,
                bottleneck: s.bottleneck
                    ? { direction: s.bottleneck.direction, approximate: s.bottleneck.approximate ?? null }
                    : null,
                lastAssistantText: s.lastAssistantText ?? null,
                lastTextTs: normalizeTs(s.ts),
                renderSafe: s.renderSafe ?? null,
                joinCollision: s.joinCollision ?? null,
                // cardCounts: honest-null today (no oracle-side tasks feed exists — see
                // the schema comment). Passed through AS-IS if a future oracle emits it
                // so the day that feed lands, only the oracle needs to change.
                cardCounts: s.cardCounts
                    ? {
                        todo: s.cardCounts.todo ?? null,
                        doing: s.cardCounts.doing ?? null,
                        blocked: s.cardCounts.blocked ?? null,
                        done: s.cardCounts.done ?? null,
                    }
                    : null,
                // tailPreview: derived from the SAME lastAssistantText/ts/renderSafe signal
                // the thought-line already voices (bounded to one line — the oracle emits
                // no multi-line transcript today). Honest-null when there's no text, so the
                // client never renders an empty-but-present tail box.
                tailPreview: s.tailPreview
                    ? {
                        // Oracle-native tailPreview, if it ever emits one directly (tolerant passthrough).
                        lines: s.tailPreview.lines,
                        ts: normalizeTs(s.tailPreview.ts),
                        renderSafe: s.tailPreview.renderSafe ?? null,
                    }
                    : (s.lastAssistantText
                        ? {
                            lines: [s.lastAssistantText],
                            ts: normalizeTs(s.ts),
                            renderSafe: s.renderSafe ?? null,
                        }
                        : null),
                // Recursive-tier fields — honest defaults for every legacy oracle row
                // (null parent / depth 0 / uncaged), real values for merged host+caged rows.
                parent_seat_id: s.parent_seat_id ?? null,
                depth: s.depth ?? 0,
                cage_status: s.cage_status ?? 'uncaged',
                cage_id: s.cage_id ?? null,
            })),
        });
    });
}
