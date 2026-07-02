import { AuthCredentials } from '@/auth/tokenStorage';
import { feedDiagnostic } from './feedDiagnostic';
import { backoff } from '@/utils/time';
import { getServerUrl } from './serverConfig';
import { getHappyClientId } from './apiSocket';
import { WardenResponse, WardenResponseSchema, WardenStatusResponse, WardenStatusResponseSchema } from './wardenTypes';

/**
 * Fetch the Warden's for-carlos queue (Hearth — P1 knock-cards).
 *
 * Polled, authed REST GET (the apiFriends pattern), NOT socket — status data
 * needs no encryption. Read-only; the Warden owns the file.
 *
 * Defensive: on a non-OK status or unparseable body we return an empty, stale
 * result rather than throwing, so the caller keeps last-good and retries on the
 * next poll (the surface never shows an error wall). `backoff` retries transport.
 */
export async function getWarden(
    credentials: AuthCredentials,
    signal?: AbortSignal,
): Promise<WardenResponse> {
    const API_ENDPOINT = getServerUrl();

    const doFetch = async (): Promise<WardenResponse> => {
        const response = await fetch(`${API_ENDPOINT}/v1/warden`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${credentials.token}`,
                'X-Happy-Client': getHappyClientId(),
            },
            signal,
        });

        if (!response.ok) {
            // 404 = route/feed not live yet — treat as empty + stale, not an error.
            return { stale: true, items: [] };
        }

        const data = await response.json();
        const parsed = WardenResponseSchema.safeParse(data);
        if (!parsed.success) {
            feedDiagnostic('warden', parsed.error);
            return { stale: true, items: [] };
        }

        return parsed.data;
    };
    // Signal path skips backoff: AbortError would loop forever inside backoff
    // otherwise, defeating cancellation. Legacy callers keep backoff behavior.
    return signal ? doFetch() : backoff(doFetch);
}

/**
 * Fetch the Warden's own heartbeat (PR-30 Slice 1 — the honest-death pip's source).
 *
 * Thin passthrough of GET /v1/warden/status. `stale` here only means "the file was
 * unreadable" (server-side IO/parse failure) — it is NOT a freshness verdict. The
 * pip's age judgment (green/greying/grey-dead) is computed by the CALLER against
 * `ts` on the client's own clock; this function never decides liveness, only fetches
 * the raw reading. Defensive like getWarden: a non-OK status or unparseable body
 * returns a stale-empty result rather than throwing.
 */
export async function getWardenStatus(
    credentials: AuthCredentials
): Promise<WardenStatusResponse> {
    const API_ENDPOINT = getServerUrl();

    return await backoff(async () => {
        const response = await fetch(`${API_ENDPOINT}/v1/warden/status`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${credentials.token}`,
                'X-Happy-Client': getHappyClientId(),
            }
        });

        if (!response.ok) {
            return { stale: true, ts: null, overall: null, checks: null };
        }

        const data = await response.json();
        const parsed = WardenStatusResponseSchema.safeParse(data);
        if (!parsed.success) {
            feedDiagnostic('warden-status', parsed.error);
            return { stale: true, ts: null, overall: null, checks: null };
        }

        return parsed.data;
    });
}

/**
 * Answer a knock-card (Hearth Slice A — the first write).
 *
 * The client never writes the queue; it POSTs here and the server routes the
 * answer through the for-carlos.mjs verb (write + channel route-back to the lane).
 * No backoff: a failed answer should report quickly, not silently retry behind the user.
 *
 * The result DISTINGUISHES a stale-token 401 from any other failure. A server bounce
 * churns the auth tokens (the documented failure mode), leaving the open tab's creds
 * dead — and there's no refresh path (creds are QR-paired), so RETRYING NEVER HELPS;
 * only a re-auth does. So `authExpired` lets the card say "session expired — re-auth"
 * instead of a futile "couldn't send — retry" (the honesty-spine made actionable, not
 * just honest). The draft is always kept so nothing Carlos typed is lost.
 */
export interface AnswerResult {
    ok: boolean;
    authExpired: boolean;
}

export async function answerWarden(
    credentials: AuthCredentials,
    id: string,
    answer: string
): Promise<AnswerResult> {
    const API_ENDPOINT = getServerUrl();
    console.log('[answerWarden] POST →', `${API_ENDPOINT}/v1/warden/answer`, { id, hasToken: !!credentials?.token });
    try {
        const response = await fetch(`${API_ENDPOINT}/v1/warden/answer`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${credentials.token}`,
                'Content-Type': 'application/json',
                'X-Happy-Client': getHappyClientId(),
            },
            body: JSON.stringify({ id, answer }),
        });
        console.log('[answerWarden] status', response.status);
        return { ok: response.ok, authExpired: response.status === 401 };
    } catch (e) {
        // Transport failure — distinct from a dead token; here a retry CAN help.
        console.log('[answerWarden] THREW (transport)', String(e));
        return { ok: false, authExpired: false };
    }
}
