import { AuthCredentials } from '@/auth/tokenStorage';
import { backoff } from '@/utils/time';
import { getServerUrl } from './serverConfig';
import { getHappyClientId } from './apiSocket';
import {
    CongressSeat,
    CongressRosterResponse,
    CongressRosterResponseSchema,
} from './congressTypes';

/**
 * Fetch the congress roster (Hearth — Phase 0 plumbing).
 *
 * Polled, authed REST GET (the apiFriends pattern), NOT socket — status data
 * needs no encryption. The client never writes this; the seats-oracle owns it.
 *
 * Defensive by design: on a non-OK status or an unparseable body we return an
 * empty, stale roster rather than throwing, so the caller keeps last-good and
 * simply retries on the next poll (never an error wall). `backoff` retries the
 * transport itself.
 */
export async function getCongressRoster(
    credentials: AuthCredentials
): Promise<CongressRosterResponse> {
    const API_ENDPOINT = getServerUrl();

    return await backoff(async () => {
        const response = await fetch(`${API_ENDPOINT}/v1/congress/roster`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${credentials.token}`,
                'X-Happy-Client': getHappyClientId(),
            }
        });

        if (!response.ok) {
            // 404 = route/feed not live yet (infra hasn't published) — treat as
            // an empty stale roster, not an error. Other codes also degrade to
            // empty so the surface never shows a loading error.
            return { ts: null, stale: true, seats: [] };
        }

        const data = await response.json();
        const parsed = CongressRosterResponseSchema.safeParse(data);
        if (!parsed.success) {
            console.error('Failed to parse congress roster:', parsed.error);
            return { ts: null, stale: true, seats: [] };
        }

        return parsed.data;
    });
}

/**
 * JOIN the roster onto sessions by `cuid === session.id` (the locked invariant).
 *
 * Pure, non-visual: given the roster rows and the set of known session ids,
 * returns a map from session id → its congress seat for the rows that match a
 * live session. Rows with no matching session (a seat whose session row isn't
 * present) are dropped; this is the projection, never a write-back.
 */
export function joinRosterToSessions(
    seats: CongressSeat[],
    sessionIds: Iterable<string>
): Map<string, CongressSeat> {
    const ids = sessionIds instanceof Set ? sessionIds : new Set(sessionIds);
    const bySession = new Map<string, CongressSeat>();
    for (const seat of seats) {
        // Worker rows have cuid:null — they never JOIN to a session.
        if (seat.cuid != null && ids.has(seat.cuid)) {
            bySession.set(seat.cuid, seat);
        }
    }
    return bySession;
}
