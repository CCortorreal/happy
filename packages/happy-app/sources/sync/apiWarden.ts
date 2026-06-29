import { AuthCredentials } from '@/auth/tokenStorage';
import { backoff } from '@/utils/time';
import { getServerUrl } from './serverConfig';
import { getHappyClientId } from './apiSocket';
import { WardenResponse, WardenResponseSchema } from './wardenTypes';

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
    credentials: AuthCredentials
): Promise<WardenResponse> {
    const API_ENDPOINT = getServerUrl();

    return await backoff(async () => {
        const response = await fetch(`${API_ENDPOINT}/v1/warden`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${credentials.token}`,
                'X-Happy-Client': getHappyClientId(),
            }
        });

        if (!response.ok) {
            // 404 = route/feed not live yet — treat as empty + stale, not an error.
            return { stale: true, items: [] };
        }

        const data = await response.json();
        const parsed = WardenResponseSchema.safeParse(data);
        if (!parsed.success) {
            console.error('Failed to parse warden response:', parsed.error);
            return { stale: true, items: [] };
        }

        return parsed.data;
    });
}

/**
 * Answer a knock-card (Hearth Slice A — the first write).
 *
 * The client never writes the queue; it POSTs here and the server routes the
 * answer through the for-carlos.mjs verb (write + channel route-back to the lane).
 * Returns true on success (including a benign already-answered double-submit),
 * false on failure so the caller can surface a quiet "couldn't send — retry"
 * without losing the draft. No backoff: a failed answer should report quickly,
 * not silently retry behind the user.
 */
export async function answerWarden(
    credentials: AuthCredentials,
    id: string,
    answer: string
): Promise<boolean> {
    const API_ENDPOINT = getServerUrl();
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
        return response.ok;
    } catch {
        return false;
    }
}
