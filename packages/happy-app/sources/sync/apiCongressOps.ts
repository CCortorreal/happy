import { z } from 'zod';
import { TokenStorage } from '@/auth/tokenStorage';
import { getServerUrl } from './serverConfig';
import { getHappyClientId } from './apiSocket';

// apiCongressOps — cockpit HANDS transport (CKP-19: PA broadcast + floor
// lifecycle). Typed, zod-parsed one-shot POST wrappers on the same auth tier as
// /v1/congress/roster (apiVram pattern: Bearer + X-Happy-Client, no blind
// backoff — these are user-initiated actions, a retry loop would double-fire a
// side-effecting POST).
//
// Every wrapper returns a DISCRIMINATED result so the caller renders honest
// state without guessing: an 'ok' variant carries the server's own truth (e.g.
// PA's `written` count — the server names exactly who got it, never the client's
// pre-count), and typed failure variants ('rate-limited', 'unavailable',
// 'error') carry exactly what the surface needs to say so and nothing it can't
// prove. The shapes are VERIFIED against congressOpsRoutes.ts.

async function authHeaders(): Promise<Record<string, string> | null> {
    const credentials = await TokenStorage.getCredentials();
    if (!credentials) return null;
    return {
        'Authorization': `Bearer ${credentials.token}`,
        'X-Happy-Client': getHappyClientId(),
        'Content-Type': 'application/json',
    };
}

// ---- PA broadcast ----------------------------------------------------------

const PaOkSchema = z.object({
    ok: z.literal(true),
    targets: z.array(z.string()),
    written: z.number(),
    logCopy: z.boolean(),
    audited: z.boolean(),
});

const PaRateLimitedSchema = z.object({
    error: z.string(),
    retryAfterMs: z.number(),
});

export type SendPaResult =
    // Server truth: `written` is the count of inboxes that actually received it.
    | { kind: 'ok'; targets: string[]; written: number; logCopy: boolean; audited: boolean }
    // 429 — the server rate-limits 1 PA per 30s; retryAfterMs is how long to wait.
    | { kind: 'rate-limited'; retryAfterMs: number }
    // 503 — membrane unreachable (no host seat inboxes), or unparseable body.
    | { kind: 'unavailable'; message: string }
    // Network throw / auth-missing / any other non-200.
    | { kind: 'error'; message: string };

/**
 * POST /v1/congress/pa — broadcast one message into every live host seat inbox.
 * The ack is server-truth (`written`), never the client's pre-count.
 */
export async function sendPa(message: string): Promise<SendPaResult> {
    const headers = await authHeaders();
    if (!headers) return { kind: 'error', message: 'not authenticated' };
    try {
        const response = await fetch(`${getServerUrl()}/v1/congress/pa`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ message }),
        });
        if (response.status === 429) {
            const parsed = PaRateLimitedSchema.safeParse(await response.json().catch(() => null));
            const retryAfterMs = parsed.success ? parsed.data.retryAfterMs : 30_000;
            return { kind: 'rate-limited', retryAfterMs };
        }
        if (response.status === 503) {
            const body = await response.json().catch(() => null) as { error?: string } | null;
            return { kind: 'unavailable', message: body?.error ?? 'peer-channel membrane unreachable' };
        }
        if (!response.ok) {
            return { kind: 'error', message: `PA failed — server returned ${response.status}` };
        }
        const parsed = PaOkSchema.safeParse(await response.json().catch(() => null));
        if (!parsed.success) {
            return { kind: 'unavailable', message: 'PA response unreadable — can\'t confirm delivery' };
        }
        return {
            kind: 'ok',
            targets: parsed.data.targets,
            written: parsed.data.written,
            logCopy: parsed.data.logCopy,
            audited: parsed.data.audited,
        };
    } catch {
        return { kind: 'error', message: 'PA failed — couldn\'t reach the server' };
    }
}

// ---- floor lifecycle (two-step arm → dry-run → confirm) --------------------

export type LifecycleAction = 'boot' | 'down';

const ArmedSchema = z.object({
    armed: z.literal(true),
    action: z.string(),
    floor: z.string(),
    dryRun: z.string(),
    dryRunKind: z.string(),
    confirmToken: z.string(),
    expiresInMs: z.number(),
    audited: z.boolean(),
});

export type ArmLifecycleResult =
    // Step-1 success: the verbatim dry-run preview + a single-use confirm token.
    | { kind: 'armed'; dryRun: string; dryRunKind: string; confirmToken: string; expiresInMs: number }
    // 502 — the dry-run itself failed; per fail-closed discipline the caller
    // must NOT render a confirm control (no blind fire without a preview).
    | { kind: 'dry-run-failed'; message: string }
    // 403 (never-down floor, bulk) / 400 (bad floor id) / 501 (script missing).
    | { kind: 'refused'; message: string }
    // Network throw / auth-missing / unparseable body.
    | { kind: 'error'; message: string };

/**
 * POST /v1/congress/floors/:floor/lifecycle with NO confirm — step 1. Runs the
 * server-side dry-run and returns its verbatim output + a confirm token. A 502
 * (dry-run failed) is surfaced as 'dry-run-failed' so the caller fails closed:
 * NO confirm button is rendered when the preview couldn't be produced.
 */
export async function armLifecycle(floor: string, action: LifecycleAction): Promise<ArmLifecycleResult> {
    const headers = await authHeaders();
    if (!headers) return { kind: 'error', message: 'not authenticated' };
    try {
        const response = await fetch(`${getServerUrl()}/v1/congress/floors/${encodeURIComponent(floor)}/lifecycle`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ action }),
        });
        if (response.status === 502) {
            const body = await response.json().catch(() => null) as { error?: string } | null;
            return { kind: 'dry-run-failed', message: body?.error ?? 'dry-run failed' };
        }
        if (response.status === 403 || response.status === 400 || response.status === 501) {
            const body = await response.json().catch(() => null) as { error?: string } | null;
            return { kind: 'refused', message: body?.error ?? `refused (${response.status})` };
        }
        if (!response.ok) {
            return { kind: 'error', message: `arm failed — server returned ${response.status}` };
        }
        const parsed = ArmedSchema.safeParse(await response.json().catch(() => null));
        if (!parsed.success) {
            return { kind: 'error', message: 'arm response unreadable — can\'t preview' };
        }
        return {
            kind: 'armed',
            dryRun: parsed.data.dryRun,
            dryRunKind: parsed.data.dryRunKind,
            confirmToken: parsed.data.confirmToken,
            expiresInMs: parsed.data.expiresInMs,
        };
    } catch {
        return { kind: 'error', message: 'arm failed — couldn\'t reach the server' };
    }
}

const ExecutedSchema = z.object({
    executed: z.literal(true),
    action: z.string(),
    floor: z.string(),
    output: z.string(),
    audited: z.boolean(),
});

export type ConfirmLifecycleResult =
    // Executed for real — `output` is the script's verbatim output.
    | { kind: 'executed'; output: string }
    // 409 — token invalid/expired/mismatched; the caller re-arms from step 1.
    | { kind: 'expired'; message: string }
    // 502 (execution failed) / 403 / 400 / 501.
    | { kind: 'failed'; message: string }
    // Network throw / auth-missing / unparseable body.
    | { kind: 'error'; message: string };

/**
 * POST /v1/congress/floors/:floor/lifecycle WITH confirm token — step 2. A 409
 * means the token expired/mismatched (re-arm); a 502 means the real run failed.
 */
export async function confirmLifecycle(
    floor: string,
    action: LifecycleAction,
    confirmToken: string,
): Promise<ConfirmLifecycleResult> {
    const headers = await authHeaders();
    if (!headers) return { kind: 'error', message: 'not authenticated' };
    try {
        const response = await fetch(`${getServerUrl()}/v1/congress/floors/${encodeURIComponent(floor)}/lifecycle`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ action, confirm: confirmToken }),
        });
        if (response.status === 409) {
            const body = await response.json().catch(() => null) as { error?: string } | null;
            return { kind: 'expired', message: body?.error ?? 'confirm token expired — re-arm' };
        }
        if (response.status === 502 || response.status === 403 || response.status === 400 || response.status === 501) {
            const body = await response.json().catch(() => null) as { error?: string } | null;
            return { kind: 'failed', message: body?.error ?? `lifecycle failed (${response.status})` };
        }
        if (!response.ok) {
            return { kind: 'error', message: `confirm failed — server returned ${response.status}` };
        }
        const parsed = ExecutedSchema.safeParse(await response.json().catch(() => null));
        if (!parsed.success) {
            return { kind: 'error', message: 'confirm response unreadable — outcome unknown' };
        }
        return { kind: 'executed', output: parsed.data.output };
    } catch {
        return { kind: 'error', message: 'confirm failed — couldn\'t reach the server' };
    }
}
