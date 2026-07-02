import { z } from "zod";
import { Fastify } from "../types";
import { appendFileSync, closeSync, existsSync, openSync, readdirSync, readFileSync, readSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";

// Congress OPS routes (Mission A2 — hands, server side). Four surfaces, all on
// the same auth tier as /v1/congress/roster:
//
//   POST /v1/congress/pa                        — PA broadcast into every HOST seat inbox
//   POST /v1/congress/floors/:floor/lifecycle   — two-step (arm→confirm) floor boot/down
//   GET  /v1/congress/kanban                    — per-floor todo/doing/blocked/done counts
//   GET  /v1/congress/relay?limit=N             — last N relay-log entries, newest last
//
// BRIGHT LINES baked in (not UI-optional):
//   • PA writes ONLY into the host peer-channel membrane
//     (~/.claude/peer-channel/state/messages/inbox/<seat>/ + one copy to .../log/),
//     NEVER into the cage. Every write path is re-asserted under the membrane
//     root before a byte lands (defense in depth — same isPaTarget doubling the
//     building's own pa.ts does).
//   • Lifecycle mirrors the building's buildingExec.ts fence VERBATIM: verb
//     allowlist, floorId charset regex, never-down-main (penthouse) — refused
//     unconditionally, never-down-all, dry-run-first (down uses building.ps1's
//     REAL `down <id> -List` dry-run), bounded execFile (timeout + maxBuffer)
//     via pwsh (PS7 — building.ps1 mis-decodes under WinPS 5.1).
//   • Two-step server-side: first call returns the dry-run preview + a
//     single-use, short-TTL confirmToken; only a second call presenting that
//     token executes. No token, no side effect.
//   • Honest states: missing building.ps1 / pwsh → 501 with the reason, never
//     an improvised taskkill. Unreadable kanban/relay files → honest omission,
//     never fabricated zeros.
//   • Every PA + lifecycle invocation (including refusals) is audit-logged to
//     ~/.happy-selfhost/congress-ops-audit.jsonl (who/when/what/result).

function homeDir(): string {
    return process.env.USERPROFILE || process.env.HOME || '';
}

// Host peer-channel membrane (inter-seat message files). The ONLY tree PA may write.
function messagesRoot(): string {
    return join(homeDir(), '.claude', 'peer-channel', 'state', 'messages');
}

// Inter-seat traffic log (peer-channel waker/digest write-path), one JSON object per line.
function relayJsonlPath(): string {
    return join(homeDir(), '.claude', 'peer-channel', 'state', 'log.jsonl');
}

// The building's runtime offices root — per-floor hive state (kanban tasks.json).
function officesDir(): string {
    return process.env.HAPPY_OFFICES_DIR || join(homeDir(), 'Desktop', 'projects', '.offices');
}

// building.ps1 — the committed floor boot/down script (PS7). Same script the
// building's own building:exec IPC shells out to.
function buildingScriptPath(): string {
    return process.env.HAPPY_BUILDING_PS1 || join(homeDir(), 'Desktop', 'projects', '.claude', 'tools', 'building.ps1');
}

function auditLogPath(): string {
    return join(homeDir(), '.happy-selfhost', 'congress-ops-audit.jsonl');
}

// Append-only ops audit trail: who/when/what/result, one JSON line per event.
// Best-effort by design (an unwritable audit file must not brick the cockpit's
// hands) — but the failure is surfaced in the response as audited:false, never
// silently swallowed into a fake-green.
function audit(entry: { who: string; action: string; params: unknown; result: string }): boolean {
    try {
        appendFileSync(auditLogPath(), JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n', 'utf8');
        return true;
    } catch {
        return false;
    }
}

// ---- PA broadcast ----------------------------------------------------------

// Rate limit: max 1 broadcast per 30s (module-level; the server is single-process).
const PA_MIN_INTERVAL_MS = 30_000;
let lastPaAtMs = 0;

// Enumerate the host seat inboxes = the subdirectories of messages/inbox/.
// gate-for-carlos and log/ are SIBLINGS of inbox/, so they can never appear here.
function listSeatInboxes(): string[] {
    try {
        return readdirSync(join(messagesRoot(), 'inbox'), { withFileTypes: true })
            .filter((d) => d.isDirectory())
            .map((d) => d.name);
    } catch {
        return []; // membrane absent → honest empty target list, never fabricated
    }
}

// Defense in depth (cage bright-line): refuse any write whose RESOLVED path
// escapes the host membrane root. Seat names come from readdirSync so this
// should be unreachable — that's the point of a bright-line assert.
function assertUnderMembrane(path: string): void {
    const root = resolve(messagesRoot());
    if (!resolve(path).startsWith(root)) {
        throw new Error(`PA write outside the host membrane refused: ${path}`);
    }
}

// Membrane message format per the cairn coordination letter (§Writing to
// another seat's inbox): markdown with a small YAML header, filename <unix-s>-<from>.md.
function membraneMessage(to: string, subject: string, body: string): string {
    return `---\nfrom: cockpit\nto: ${to}\nkind: coord\nsubject: ${subject}\n---\n${body}\n`;
}

// ---- floor lifecycle (ported VERBATIM from building buildingExec.ts fences) ----

// A floorId is a short manifest token. Tight allowlist charset — nothing
// shell-special or path-traversing can smuggle into the pwsh arg vector.
const FLOOR_ID_RE = /^[A-Za-z0-9_-]{1,32}$/;

// Floors whose down is FORBIDDEN no matter what. 'main' is the penthouse/god
// session (port 5177); building.ps1 re-derives the same exclusion independently
// (defense in depth), but we REFUSE here so the request never reaches it.
const NEVER_DOWN = new Set(['main', 'penthouse']);

// Locate pwsh.exe (PowerShell 7) — PATH first, WindowsApps shim fallback.
// building.ps1 MUST run under pwsh (WinPS 5.1 mis-decodes its BOM-less UTF-8).
function findPwsh(): string {
    const shim = process.env.LOCALAPPDATA
        ? join(process.env.LOCALAPPDATA, 'Microsoft', 'WindowsApps', 'pwsh.exe')
        : null;
    if (shim && existsSync(shim)) return shim;
    return 'pwsh.exe';
}

// Bound + trim child output so a chatty boot log can't flood the wire.
function boundOutput(stdout: string, stderr: string): string {
    const combined = [stdout, stderr].filter(Boolean).join('\n').trim();
    const MAX = 16 * 1024;
    return combined.length > MAX ? combined.slice(0, MAX) + '\n…(truncated)' : combined;
}

// Bounded execFile of building.ps1 — fires ONLY after every fence has passed.
function runBuildingPs1(args: string[], timeoutMs: number): Promise<{ ok: boolean; output: string }> {
    return new Promise((res) => {
        execFile(
            findPwsh(),
            ['-NoProfile', '-File', buildingScriptPath(), ...args],
            { maxBuffer: 4 * 1024 * 1024, timeout: timeoutMs, windowsHide: true },
            (err, stdout, stderr) => {
                const output = boundOutput(stdout ?? '', stderr ?? '');
                if (err) {
                    res({ ok: false, output: output || err.message });
                    return;
                }
                res({ ok: true, output });
            }
        );
    });
}

// Two-step arm→confirm state. A confirm token is single-use, short-TTL, and
// bound to the exact (action, floor) pair it armed — presenting it with any
// other pair is a refusal, not a match.
interface PendingConfirm {
    action: 'boot' | 'down';
    floor: string;
    expiresAt: number;
}
const CONFIRM_TTL_MS = 120_000;
const pendingConfirms = new Map<string, PendingConfirm>();

function sweepExpiredConfirms(): void {
    const now = Date.now();
    for (const [token, p] of pendingConfirms.entries()) {
        if (p.expiresAt < now) pendingConfirms.delete(token);
    }
}

// ---- kanban ----------------------------------------------------------------

const TasksFileSchema = z.object({
    tasks: z.array(z.object({
        status: z.string().nullish(),
    })).nullish(),
});

// ---- relay -----------------------------------------------------------------

// One line of ~/.claude/peer-channel/state/log.jsonl (seats-oracle/waker traffic log).
const RelayJsonlLineSchema = z.object({
    seat: z.string().nullish(),
    from: z.string().nullish(),
    to: z.string().nullish(),
    ts: z.union([z.string(), z.number()]).nullish(),
    kind: z.string().nullish(),
    body: z.string().nullish(),
    subject: z.string().nullish(),
});

interface RelayEntry {
    ts: string;
    from: string;
    to: string;
    kind: string;
    excerpt: string;
}

function toEpochMs(ts: string | number | null | undefined): number | null {
    if (ts == null) return null;
    if (typeof ts === 'number') return ts > 1e12 ? ts : ts * 1000;
    const parsed = Date.parse(ts);
    return Number.isFinite(parsed) ? parsed : null;
}

// Stable content-derived item id (CKP-01): the client schema requires one (it is
// the RELAY plane's React key) and the log lines carry none. djb2 over the fields
// that make an entry "the same entry" — identical content at the same instant
// hashes identically on every poll, so keys are stable across refetches and the
// merge-dedupe can key on it.
function relayItemId(epochMs: number, from: string, to: string, excerpt: string): string {
    const s = `${epochMs}|${from}|${to}|${excerpt}`;
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return `r${epochMs.toString(36)}-${h.toString(36)}`;
}

// Tail-read log.jsonl (bounded — never slurp an unbounded log into memory).
const RELAY_TAIL_BYTES = 2 * 1024 * 1024;

function readRelayJsonl(): { entries: Array<RelayEntry & { epochMs: number }>; available: boolean } {
    const path = relayJsonlPath();
    let fd: number;
    let size: number;
    try {
        size = statSync(path).size;
        fd = openSync(path, 'r');
    } catch {
        return { entries: [], available: false };
    }
    let raw: string;
    try {
        const offset = Math.max(0, size - RELAY_TAIL_BYTES);
        const buf = Buffer.alloc(Math.min(size, RELAY_TAIL_BYTES));
        readSync(fd, buf, 0, buf.length, offset);
        raw = buf.toString('utf8');
        // If we started mid-file, the first line is almost certainly partial — drop it.
        if (offset > 0) raw = raw.slice(raw.indexOf('\n') + 1);
    } catch {
        return { entries: [], available: false };
    } finally {
        closeSync(fd);
    }
    const entries: Array<RelayEntry & { epochMs: number }> = [];
    for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let json: unknown;
        try {
            json = JSON.parse(trimmed);
        } catch {
            continue; // one mangled line drops just itself
        }
        const parsed = RelayJsonlLineSchema.safeParse(json);
        if (!parsed.success) continue;
        const e = parsed.data;
        const epochMs = toEpochMs(e.ts);
        if (epochMs == null) continue; // unordered entries are honestly omitted
        entries.push({
            epochMs,
            ts: new Date(epochMs).toISOString(),
            from: e.from ?? e.seat ?? 'unknown',
            to: e.to ?? 'unknown',
            // The jsonl does not record a message kind — 'unknown' is the honest
            // value, never a guessed 'coord'.
            kind: e.kind ?? 'unknown',
            excerpt: (e.body ?? e.subject ?? '').slice(0, 200),
        });
    }
    return { entries, available: true };
}

// Membrane processed-message archive: messages/log/<unix-s>-<from>[-<subject>].md
// (cairn letter §Reading YOUR inbox — processed inbox files are MOVED here).
function readMembraneLog(): { entries: Array<RelayEntry & { epochMs: number }>; available: boolean } {
    const dir = join(messagesRoot(), 'log');
    let files: string[];
    try {
        files = readdirSync(dir).filter((f) => f.endsWith('.md'));
    } catch {
        return { entries: [], available: false };
    }
    const entries: Array<RelayEntry & { epochMs: number }> = [];
    for (const f of files) {
        const tsMatch = /^(\d{9,13})-/.exec(f);
        if (!tsMatch) continue;
        const epochMs = toEpochMs(Number(tsMatch[1]));
        if (epochMs == null) continue;
        let raw: string;
        try {
            raw = readFileSync(join(dir, f), 'utf8');
        } catch {
            continue;
        }
        // Small YAML header: from/to/kind/subject — parse the simple key: value lines.
        const header: Record<string, string> = {};
        const headerMatch = /^---\n([\s\S]*?)\n---/.exec(raw);
        if (headerMatch) {
            for (const line of headerMatch[1].split('\n')) {
                const kv = /^(\w[\w-]*):\s*(.*)$/.exec(line.trim());
                if (kv) header[kv[1]] = kv[2];
            }
        }
        const body = headerMatch ? raw.slice(headerMatch[0].length).trim() : raw.trim();
        entries.push({
            epochMs,
            ts: new Date(epochMs).toISOString(),
            from: header['from'] ?? 'unknown',
            to: header['to'] ?? 'unknown',
            kind: header['kind'] ?? 'unknown',
            excerpt: (header['subject'] ? `${header['subject']} — ${body}` : body).slice(0, 200),
        });
    }
    return { entries, available: true };
}

// ---- routes ----------------------------------------------------------------

export function congressOpsRoutes(app: Fastify) {

    // POST /v1/congress/pa — broadcast ONE message into EVERY host seat inbox
    // (+ one archival copy to messages/log/). Host membrane only; never the cage.
    app.post('/v1/congress/pa', {
        schema: {
            body: z.object({
                message: z.string().min(1).max(8192),
            }),
            response: {
                200: z.object({
                    ok: z.literal(true),
                    targets: z.array(z.string()),
                    written: z.number(),
                    logCopy: z.boolean(),
                    audited: z.boolean(),
                }),
                429: z.object({
                    error: z.string(),
                    retryAfterMs: z.number(),
                }),
                503: z.object({
                    error: z.string(),
                }),
            },
        },
        preHandler: app.authenticate
    }, async (request, reply) => {
        const { message } = request.body;

        // Rate limit: max 1 per 30s — a PA that fans to every seat is expensive
        // attention; refuse (429 + retryAfterMs), never queue silently.
        const now = Date.now();
        if (now - lastPaAtMs < PA_MIN_INTERVAL_MS) {
            const retryAfterMs = PA_MIN_INTERVAL_MS - (now - lastPaAtMs);
            audit({ who: request.userId, action: 'pa', params: { chars: message.length }, result: `refused: rate-limited (${retryAfterMs}ms left)` });
            return reply.code(429).send({ error: 'PA rate limit: max 1 broadcast per 30s', retryAfterMs });
        }

        const seats = listSeatInboxes();
        if (seats.length === 0) {
            audit({ who: request.userId, action: 'pa', params: { chars: message.length }, result: 'refused: no host seat inboxes found (membrane absent?)' });
            return reply.code(503).send({ error: 'no host seat inboxes found — peer-channel membrane unreachable' });
        }

        // Subject = first line of the message, collapsed + bounded.
        const subject = message.split('\n')[0].trim().slice(0, 80) || 'PA broadcast';
        const tsSec = Math.floor(now / 1000);
        const fileName = `${tsSec}-cockpit.md`;

        const written: string[] = [];
        for (const seat of seats) {
            const path = join(messagesRoot(), 'inbox', seat, fileName);
            try {
                assertUnderMembrane(path); // cage bright-line, re-asserted per target
                writeFileSync(path, membraneMessage(seat, subject, message), 'utf8');
                written.push(seat);
            } catch {
                // One unwritable inbox drops just that target; the response names
                // exactly who got it — never claims a fan-out that didn't land.
            }
        }

        // Archival copy to messages/log/ (same membrane, log convention:
        // <ts>-<from>-<subject-slug>.md).
        let logCopy = false;
        try {
            const slug = subject.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'pa';
            const logFile = join(messagesRoot(), 'log', `${tsSec}-cockpit-${slug}.md`);
            assertUnderMembrane(logFile);
            writeFileSync(logFile, membraneMessage('all-seats', subject, message), 'utf8');
            logCopy = true;
        } catch {
            // log copy is best-effort; surfaced honestly below
        }

        if (written.length > 0) {
            lastPaAtMs = now; // consume the rate-limit window only on an actual fan-out
        }
        const audited = audit({
            who: request.userId,
            action: 'pa',
            params: { subject, chars: message.length },
            result: `written to ${written.length}/${seats.length} inboxes [${written.join(', ')}], logCopy=${logCopy}`,
        });
        return reply.send({ ok: true as const, targets: written, written: written.length, logCopy, audited });
    });

    // POST /v1/congress/floors/:floor/lifecycle — two-step floor boot/down via
    // the building's committed building.ps1 (the ONE building power that is
    // framework-agnostic per the mechanism map — fences ported verbatim).
    //   Step 1 (no confirm): run the dry-run, return preview + confirmToken.
    //   Step 2 (confirm: <token>): execute for real. Token is single-use, 120s TTL,
    //   bound to the exact action+floor.
    app.post('/v1/congress/floors/:floor/lifecycle', {
        schema: {
            params: z.object({
                floor: z.string(),
            }),
            body: z.object({
                action: z.enum(['boot', 'down']),
                confirm: z.string().optional(),
            }),
            response: {
                200: z.union([
                    z.object({
                        armed: z.literal(true),
                        action: z.string(),
                        floor: z.string(),
                        dryRun: z.string(),
                        // 'down' uses building.ps1's REAL dry-run (down <id> -List:
                        // the PIDs a down WOULD stop). 'boot' has no script-side
                        // dry-run — the preview is the current manifest/live listing.
                        dryRunKind: z.string(),
                        confirmToken: z.string(),
                        expiresInMs: z.number(),
                        audited: z.boolean(),
                    }),
                    z.object({
                        executed: z.literal(true),
                        action: z.string(),
                        floor: z.string(),
                        output: z.string(),
                        audited: z.boolean(),
                    }),
                ]),
                400: z.object({ error: z.string() }),
                403: z.object({ error: z.string() }),
                409: z.object({ error: z.string() }),
                501: z.object({ error: z.string() }),
                502: z.object({ error: z.string() }),
            },
        },
        preHandler: app.authenticate
    }, async (request, reply) => {
        const { floor } = request.params;
        const { action, confirm } = request.body;
        const who = request.userId;

        // Fence: floorId charset allowlist (verbatim from buildingExec.ts).
        if (!FLOOR_ID_RE.test(floor)) {
            audit({ who, action: `lifecycle:${action}`, params: { floor }, result: 'refused: invalid floorId' });
            return reply.code(400).send({ error: 'invalid floorId' });
        }
        // Fence: the penthouse/main floor is NEVER a down target — unconditional,
        // no confirm token can override it. (building.ps1 re-derives the same rule.)
        if (action === 'down' && NEVER_DOWN.has(floor.toLowerCase())) {
            audit({ who, action: 'lifecycle:down', params: { floor }, result: 'refused: never main/penthouse' });
            return reply.code(403).send({ error: 'the penthouse/main floor is never a down target' });
        }
        // Fence: no bulk down from this surface (building's view never bulk-downs either).
        if (action === 'down' && floor.toLowerCase() === 'all') {
            audit({ who, action: 'lifecycle:down', params: { floor }, result: 'refused: never all' });
            return reply.code(403).send({ error: 'bulk down is not available from this surface' });
        }
        // Honest 501 when the bridge is not safely invokable from this process.
        if (!existsSync(buildingScriptPath())) {
            audit({ who, action: `lifecycle:${action}`, params: { floor }, result: `501: building.ps1 not found at ${buildingScriptPath()}` });
            return reply.code(501).send({ error: `building.ps1 not found at ${buildingScriptPath()} — floor lifecycle not invokable from this host` });
        }

        if (!confirm) {
            // ── Step 1: ARM — dry-run preview + single-use confirm token. ──
            const dryArgs = action === 'down' ? ['down', floor, '-List'] : ['-List'];
            const dryRunKind = action === 'down'
                ? 'script-dry-run (PIDs a real down would stop; nothing stopped)'
                : 'list-preview (building.ps1 has no boot dry-run; this is the current manifest/live state)';
            const dry = await runBuildingPs1(dryArgs, 15_000);
            if (!dry.ok) {
                audit({ who, action: `lifecycle:${action}:arm`, params: { floor }, result: `dry-run failed: ${dry.output.slice(0, 300)}` });
                return reply.code(502).send({ error: `dry-run failed: ${dry.output.slice(0, 2000)}` });
            }
            sweepExpiredConfirms();
            const token = randomBytes(16).toString('hex');
            pendingConfirms.set(token, { action, floor, expiresAt: Date.now() + CONFIRM_TTL_MS });
            const audited = audit({ who, action: `lifecycle:${action}:arm`, params: { floor }, result: `armed (token issued, ttl ${CONFIRM_TTL_MS}ms)` });
            return reply.send({
                armed: true as const,
                action,
                floor,
                dryRun: dry.output,
                dryRunKind,
                confirmToken: token,
                expiresInMs: CONFIRM_TTL_MS,
                audited,
            });
        }

        // ── Step 2: CONFIRM — single-use token, bound to this exact action+floor. ──
        sweepExpiredConfirms();
        const pending = pendingConfirms.get(confirm);
        if (!pending || pending.action !== action || pending.floor !== floor) {
            audit({ who, action: `lifecycle:${action}:confirm`, params: { floor }, result: 'refused: confirm token invalid/expired/mismatched' });
            return reply.code(409).send({ error: 'confirm token invalid, expired, or bound to a different action/floor — re-arm first' });
        }
        pendingConfirms.delete(confirm); // single-use, consumed before execution

        const realArgs = action === 'down' ? ['down', floor] : [floor];
        // 'boot' can take a while (electron-vite startup); down is quick — same
        // bounds as the building's own IPC.
        const timeout = action === 'boot' ? 60_000 : 15_000;
        const result = await runBuildingPs1(realArgs, timeout);
        const audited = audit({
            who,
            action: `lifecycle:${action}:confirm`,
            params: { floor },
            result: result.ok ? `executed: ${result.output.slice(0, 300)}` : `FAILED: ${result.output.slice(0, 300)}`,
        });
        if (!result.ok) {
            return reply.code(502).send({ error: `lifecycle ${action} failed: ${result.output.slice(0, 2000)}` });
        }
        return reply.send({ executed: true as const, action, floor, output: result.output, audited });
    });

    // GET /v1/congress/kanban — per-floor work-item counts read from each
    // floor's hive/tasks.json (the same file the building's tile projects).
    // Read-only; a floor without a readable board is honestly OMITTED, never
    // served as fake zeros. Envelope matches the relay route's client-contract
    // convention (CKP-02): { ts, stale, floors } — ts = newest board mtime,
    // stale = the offices root itself was unreadable (building unreachable,
    // distinct from readable-but-boardless which is a fresh empty list).
    app.get('/v1/congress/kanban', {
        schema: {
            response: {
                200: z.object({
                    ts: z.number().nullable(),
                    stale: z.boolean(),
                    floors: z.array(z.object({
                        floor: z.string(),
                        todo: z.number(),
                        doing: z.number(),
                        blocked: z.number(),
                        done: z.number(),
                        total: z.number(),
                        // board file mtime (epoch ms) — the honest-staleness signal
                        ts: z.number(),
                    })),
                }),
            },
        },
        preHandler: app.authenticate
    }, async (_request, reply) => {
        let floorDirs: string[];
        try {
            floorDirs = readdirSync(officesDir(), { withFileTypes: true })
                .filter((d) => d.isDirectory())
                .map((d) => d.name);
        } catch {
            // offices root absent/unreadable → the building itself is unreachable
            return reply.send({ ts: null, stale: true, floors: [] });
        }
        const floors: Array<{ floor: string; todo: number; doing: number; blocked: number; done: number; total: number; ts: number }> = [];
        for (const floor of floorDirs) {
            const boardPath = join(officesDir(), floor, 'hive', 'tasks.json');
            let raw: string;
            let mtimeMs: number;
            try {
                mtimeMs = statSync(boardPath).mtimeMs;
                raw = readFileSync(boardPath, 'utf8');
            } catch {
                continue; // no board → honest omission
            }
            let json: unknown;
            try {
                json = JSON.parse(raw);
            } catch {
                continue;
            }
            const parsed = TasksFileSchema.safeParse(json);
            if (!parsed.success) continue;
            const counts = { todo: 0, doing: 0, blocked: 0, done: 0 };
            const tasks = parsed.data.tasks ?? [];
            for (const t of tasks) {
                const s = (t.status ?? '').toLowerCase();
                if (s === 'todo' || s === 'doing' || s === 'blocked' || s === 'done') counts[s]++;
                // unknown statuses count toward total only — never guessed into a lane
            }
            floors.push({ floor, ...counts, total: tasks.length, ts: Math.round(mtimeMs) });
        }
        return reply.send({
            ts: floors.length > 0 ? Math.max(...floors.map((f) => f.ts)) : null,
            stale: false,
            floors,
        });
    });

    // GET /v1/congress/relay?limit=N — last N inter-seat relay-log entries,
    // newest LAST. Two read-only sources merged: the peer-channel traffic log
    // (state/log.jsonl) and the membrane's processed-message archive
    // (state/messages/log/*.md). Wire shape mirrors the client's
    // CongressRelayResponseSchema (congressRelayTypes.ts): { ts, stale, items }
    // with numeric epoch-ms timestamps and a stable per-item id (CKP-01 — the
    // old { entries, sources } envelope with ISO ts failed every client parse).
    // `kind` + `sources` ride along as extra keys (client zod strips them);
    // `sources` keeps an empty list distinguishable from an unreadable log.
    app.get('/v1/congress/relay', {
        schema: {
            querystring: z.object({
                limit: z.coerce.number().int().min(1).max(500).default(50),
            }),
            response: {
                200: z.object({
                    ts: z.number().nullable(),
                    stale: z.boolean(),
                    items: z.array(z.object({
                        id: z.string(),
                        ts: z.number(),
                        from: z.string(),
                        to: z.string(),
                        kind: z.string(),
                        excerpt: z.string(),
                    })),
                    sources: z.object({
                        logJsonl: z.boolean(),
                        membraneLog: z.boolean(),
                    }),
                }),
            },
        },
        preHandler: app.authenticate
    }, async (request, reply) => {
        const { limit } = request.query;
        const jsonl = readRelayJsonl();
        const membrane = readMembraneLog();
        const seen = new Set<string>();
        const items: Array<{ id: string; ts: number; from: string; to: string; kind: string; excerpt: string }> = [];
        // Dedupe by content id AFTER the merge — the same message can appear in
        // both sources (e.g. a PA lands in log.jsonl AND the membrane archive).
        for (const e of [...jsonl.entries, ...membrane.entries].sort((a, b) => a.epochMs - b.epochMs)) {
            const id = relayItemId(e.epochMs, e.from, e.to, e.excerpt);
            if (seen.has(id)) continue;
            seen.add(id);
            items.push({ id, ts: e.epochMs, from: e.from, to: e.to, kind: e.kind, excerpt: e.excerpt });
        }
        const sliced = items.slice(-limit);
        return reply.send({
            ts: sliced.length > 0 ? sliced[sliced.length - 1].ts : null,
            stale: !jsonl.available && !membrane.available,
            items: sliced,
            sources: { logJsonl: jsonl.available, membraneLog: membrane.available },
        });
    });
}
