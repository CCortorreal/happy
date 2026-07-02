import { AuthCredentials } from '@/auth/tokenStorage';
import { feedDiagnostic } from './feedDiagnostic';
import { backoff } from '@/utils/time';
import { getServerUrl } from './serverConfig';
import { getHappyClientId } from './apiSocket';
import { CongressRelayResponse, CongressRelayResponseSchema } from './congressRelayTypes';

/**
 * Fetch the congress relay feed (cockpit-v2 RELAY plane, mission A3).
 *
 * Polled, authed REST GET — same apiBacklog/apiCongress pattern, NOT socket.
 * Defensive by design: a non-OK status (including 404 — the route may not be
 * live server-side yet) or an unparseable body returns a stale, empty
 * response so the caller keeps last-good and the LOUD-guard distinguishes
 * broken from a genuinely quiet relay.
 */
export async function getCongressRelay(credentials: AuthCredentials): Promise<CongressRelayResponse> {
    const API_ENDPOINT = getServerUrl();

    return await backoff(async () => {
        const response = await fetch(`${API_ENDPOINT}/v1/congress/relay`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${credentials.token}`,
                'X-Happy-Client': getHappyClientId(),
            }
        });

        if (!response.ok) {
            return { ts: null, stale: true, items: [] };
        }

        const data = await response.json();
        const parsed = CongressRelayResponseSchema.safeParse(data);
        if (!parsed.success) {
            feedDiagnostic('congress-relay', parsed.error);
            return { ts: null, stale: true, items: [] };
        }

        return parsed.data;
    });
}
