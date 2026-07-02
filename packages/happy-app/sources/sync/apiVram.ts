import { AuthCredentials } from '@/auth/tokenStorage';
import { backoff } from '@/utils/time';
import { getServerUrl } from './serverConfig';
import { getHappyClientId } from './apiSocket';
import { VramResponse, VramResponseSchema } from './vramTypes';

/**
 * Fetch the VRAM gauge feed (Hearth — MONITOR pillar).
 *
 * Polled authed REST GET (the apiWarden/apiCongress pattern), NOT socket. Reads
 * device-health's vram-engine.json via the server projection. Defensive: on a
 * non-OK status or unparseable body, returns `{ stale: true, view: null }` so the
 * caller keeps last-good and the LOUD-guard distinguishes broken from quiet.
 */
export async function getVram(credentials: AuthCredentials, signal?: AbortSignal): Promise<VramResponse> {
    const API_ENDPOINT = getServerUrl();
    const doFetch = async (): Promise<VramResponse> => {
        const response = await fetch(`${API_ENDPOINT}/v1/vram`, {
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
        const parsed = VramResponseSchema.safeParse(data);
        if (!parsed.success) {
            console.error('Failed to parse vram response:', parsed.error);
            return { stale: true, view: null };
        }
        return parsed.data;
    };
    // When the caller (useHonestFeed) supplies an AbortSignal, SKIP backoff:
    // useHonestFeed already re-polls on failure, and backoff would swallow an
    // AbortError from fetch and retry forever, defeating cancellation. Callers
    // without a signal keep the legacy backoff behavior — no behavior change.
    return signal ? doFetch() : backoff(doFetch);
}
