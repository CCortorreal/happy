import { AuthCredentials } from '@/auth/tokenStorage';
import { feedDiagnostic } from './feedDiagnostic';
import { backoff } from '@/utils/time';
import { getServerUrl } from './serverConfig';
import { getHappyClientId } from './apiSocket';
import { BacklogResponse, BacklogResponseSchema } from './backlogTypes';

/**
 * Fetch the backlog gauge feed (Hearth — MONITOR pillar).
 *
 * Polled authed REST GET (the apiVram/apiDisk/apiHeartbeat pattern), NOT socket. Reads
 * infra's backlog feed via the server projection. Defensive: on a non-OK status or
 * unparseable body, returns `{ stale: true, view: null }` so the caller keeps last-good
 * and the LOUD-guard distinguishes broken from quiet.
 */
export async function getBacklog(credentials: AuthCredentials, signal?: AbortSignal): Promise<BacklogResponse> {
    const API_ENDPOINT = getServerUrl();
    const doFetch = async (): Promise<BacklogResponse> => {
        const response = await fetch(`${API_ENDPOINT}/v1/backlog`, {
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
        const parsed = BacklogResponseSchema.safeParse(data);
        if (!parsed.success) {
            feedDiagnostic('backlog', parsed.error);
            return { stale: true, view: null };
        }
        return parsed.data;
    };
    // When the caller (useHonestFeed) supplies an AbortSignal, SKIP backoff:
    // useHonestFeed already re-polls on failure, and backoff would swallow an
    // AbortError from fetch and retry forever, leaking orphaned retries past the
    // 4s poll timeout. Callers without a signal keep the legacy backoff behavior.
    return signal ? doFetch() : backoff(doFetch);
}
