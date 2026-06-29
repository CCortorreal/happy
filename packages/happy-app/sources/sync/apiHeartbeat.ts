import { AuthCredentials } from '@/auth/tokenStorage';
import { backoff } from '@/utils/time';
import { getServerUrl } from './serverConfig';
import { getHappyClientId } from './apiSocket';
import { HeartbeatResponse, HeartbeatResponseSchema } from './heartbeatTypes';

/**
 * Fetch the CONTEXT/heartbeat gauge feed (Hearth — MONITOR pillar).
 *
 * Polled authed REST GET (the apiVram pattern), NOT socket. Reads ai-ops's heartbeat-
 * sentinel feed via the server projection. Defensive: on a non-OK status or unparseable
 * body, returns `{ stale: true, view: null }` so the caller keeps last-good and the
 * LOUD-guard distinguishes broken from quiet (here, stale-feed == daemon-dead signal).
 */
export async function getHeartbeat(credentials: AuthCredentials): Promise<HeartbeatResponse> {
    const API_ENDPOINT = getServerUrl();
    return await backoff(async () => {
        const response = await fetch(`${API_ENDPOINT}/v1/heartbeat`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${credentials.token}`,
                'X-Happy-Client': getHappyClientId(),
            }
        });
        if (!response.ok) {
            return { stale: true, view: null };
        }
        const data = await response.json();
        const parsed = HeartbeatResponseSchema.safeParse(data);
        if (!parsed.success) {
            console.error('Failed to parse heartbeat response:', parsed.error);
            return { stale: true, view: null };
        }
        return parsed.data;
    });
}
