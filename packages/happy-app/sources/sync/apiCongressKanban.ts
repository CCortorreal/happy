import { AuthCredentials } from '@/auth/tokenStorage';
import { feedDiagnostic } from './feedDiagnostic';
import { backoff } from '@/utils/time';
import { getServerUrl } from './serverConfig';
import { getHappyClientId } from './apiSocket';
import { CongressKanbanResponse, CongressKanbanResponseSchema } from './congressKanbanTypes';

/**
 * Fetch the congress kanban feed (cockpit-v2 work-state grid, mission A3).
 *
 * Polled, authed REST GET — the apiBacklog/apiCongress pattern, NOT socket.
 * Defensive by design: a non-OK status (including 404 — the route may not be
 * live server-side yet, same posture apiCongress.ts takes on its roster GET)
 * or an unparseable body returns a stale, empty response so the caller keeps
 * last-good and the LOUD-guard in useHonestFeed distinguishes broken from quiet.
 */
export async function getCongressKanban(credentials: AuthCredentials): Promise<CongressKanbanResponse> {
    const API_ENDPOINT = getServerUrl();

    return await backoff(async () => {
        const response = await fetch(`${API_ENDPOINT}/v1/congress/kanban`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${credentials.token}`,
                'X-Happy-Client': getHappyClientId(),
            }
        });

        if (!response.ok) {
            return { ts: null, stale: true, floors: [] };
        }

        const data = await response.json();
        const parsed = CongressKanbanResponseSchema.safeParse(data);
        if (!parsed.success) {
            feedDiagnostic('congress-kanban', parsed.error);
            return { ts: null, stale: true, floors: [] };
        }

        return parsed.data;
    });
}
