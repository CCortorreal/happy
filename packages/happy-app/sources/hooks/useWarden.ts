import * as React from 'react';
import { TokenStorage } from '@/auth/tokenStorage';
import { getWarden } from '@/sync/apiWarden';
import { WardenItem } from '@/sync/wardenTypes';

// useWarden — Hearth P1 (the knock-cards).
//
// Polls GET /v1/warden and returns the for-carlos items with the LOUD-guard's
// three-state feed discipline (the roster/vram keystone lesson, generalized here by
// loom's flag): a feed-reader must distinguish render(data) / genuinely-quiet(empty)
// / unreachable(LOUD) — never collapse a broken feed into silent-empty. That matters
// MORE on this surface than on a gauge: the knock-cards are an ACTION surface, so a
// dead feed silently reading "nothing pending" is the worst case (Carlos believes
// he's all-clear while the Warden can't reach him, and answers wouldn't send).
//
// getWarden never throws — on an IO/parse failure (or the feed not being live yet)
// it returns `{ stale: true, items: [] }`. Discipline (mirrors useVram exactly):
//   - a good fresh read -> adopt items, clear the failure count;
//   - a stale/failed read -> KEEP LAST GOOD (cards don't flicker away), count a
//     failure; one mid-write blip never flashes an alarm;
//   - persistent failure with NOTHING to show -> `unreachable` LOUD, never a silent
//     empty that reads as the all-clear.

const POLL_INTERVAL_MS = 5000;
const UNREACHABLE_AFTER = 3;

export function useWarden(): { items: WardenItem[]; unreachable: boolean } {
    const [state, setState] = React.useState<{ items: WardenItem[]; unreachable: boolean }>({
        items: [],
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
                    // LOUD only when there's nothing real to show (last-good empty) —
                    // a stale read with cards still up keeps showing them, quietly.
                    const loud = failures.current >= UNREACHABLE_AFTER && prev.items.length === 0;
                    return prev.unreachable === loud ? prev : { ...prev, unreachable: loud };
                });
            }
        };

        const poll = async () => {
            try {
                const credentials = await TokenStorage.getCredentials();
                if (mounted && credentials) {
                    const response = await getWarden(credentials);
                    if (mounted && !response.stale) {
                        failures.current = 0;
                        setState({ items: response.items, unreachable: false });
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
