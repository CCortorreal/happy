import * as React from 'react';
import { TokenStorage } from '@/auth/tokenStorage';
import { getVram } from '@/sync/apiVram';
import { VramView } from '@/sync/vramTypes';

// useVram — Hearth MONITOR pillar (the VRAM gauge feed).
//
// Polls GET /v1/vram. Carries the LOUD-guard's three-state discipline (the roster
// keystone lesson): a good read with data -> render; a stale/failed read keeps
// last-good; persistent failure with NOTHING to show -> `unreachable` LOUD, never a
// silent zero that reads as "0GB used". `unreachable` flips after a few consecutive
// failures so one mid-write blip doesn't flash an alarm.

const POLL_INTERVAL_MS = 5000;
const UNREACHABLE_AFTER = 3;

export function useVram(): { view: VramView | null; unreachable: boolean } {
    const [state, setState] = React.useState<{ view: VramView | null; unreachable: boolean }>({
        view: null,
        unreachable: false,
    });
    const failures = React.useRef(0);

    React.useEffect(() => {
        let mounted = true;
        let timer: ReturnType<typeof setTimeout> | null = null;

        const markFailure = () => {
            failures.current += 1;
            if (mounted) {
                setState((prev) => {
                    const loud = failures.current >= UNREACHABLE_AFTER && prev.view === null;
                    return prev.unreachable === loud ? prev : { ...prev, unreachable: loud };
                });
            }
        };

        const poll = async () => {
            try {
                const credentials = await TokenStorage.getCredentials();
                if (mounted && credentials) {
                    const response = await getVram(credentials);
                    if (mounted && !response.stale && response.view) {
                        failures.current = 0;
                        setState({ view: response.view, unreachable: false });
                    } else if (mounted) {
                        markFailure();
                    }
                }
            } catch {
                markFailure();
            } finally {
                if (mounted) {
                    timer = setTimeout(poll, POLL_INTERVAL_MS);
                }
            }
        };

        poll();

        return () => {
            mounted = false;
            if (timer) {
                clearTimeout(timer);
            }
        };
    }, []);

    return state;
}
