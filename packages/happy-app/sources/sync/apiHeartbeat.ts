import { AuthCredentials } from '@/auth/tokenStorage';
import { feedDiagnostic } from './feedDiagnostic';
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
export async function getHeartbeat(credentials: AuthCredentials, signal?: AbortSignal): Promise<HeartbeatResponse> {
    const API_ENDPOINT = getServerUrl();
    const doFetch = async (): Promise<HeartbeatResponse> => {
        const response = await fetch(`${API_ENDPOINT}/v1/heartbeat`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${credentials.token}`,
                'X-Happy-Client': getHappyClientId(),
            },
            signal,
        });
        if (!response.ok) {
            return { stale: true, view: null };
        }
        const data = await response.json();
        const parsed = HeartbeatResponseSchema.safeParse(data);
        if (!parsed.success) {
            feedDiagnostic('heartbeat', parsed.error);
            return { stale: true, view: null };
        }
        return parsed.data;
    };
    // Signal path skips backoff (see apiVram note): AbortError would loop forever
    // otherwise, defeating cancellation. Legacy callers keep backoff behavior.
    return signal ? doFetch() : backoff(doFetch);
}
