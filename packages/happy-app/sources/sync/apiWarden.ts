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
