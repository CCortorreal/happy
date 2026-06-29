import * as React from 'react';
import { TokenStorage, AuthCredentials } from '@/auth/tokenStorage';

// useHonestFeed — the Hearth's #0 invariant made shared (the cross-pillar render
// rule the lanes all named): NEVER EMIT A CONFIDENT LIE. A signal that cannot prove
// itself fresh must look dead, never calm. This is the `stale≠fresh / dead≠alive`
// third of the invariant (the data-feed side); its siblings `staged≠applied` and
// `built≠live` live in the render primitives (see HonestSignal.tsx).
//
// Every cockpit gauge polls a feed, and a feed has THREE honest states — never two:
//   1. RENDER   — a fresh read with content -> show it.
//   2. QUIET    — a fresh read that's genuinely empty -> the all-clear (render nothing).
//   3. LOUD     — persistently unreachable/stale with nothing to show -> say so loudly.
// The trap (which kept the roster GET silently dark for hours) is collapsing 3 into 2:
// a broken feed that reads as empty looks identical to a calm one. This hook keeps the
// three states distinct ONCE, so every gauge inherits the honesty for free:
//   - a fresh read (stale=false) is authoritative -> adopt its data, clear failures;
//   - a stale/failed read -> KEEP LAST GOOD (no flicker), count a failure;
//   - `unreachableAfter` consecutive failures with nothing worth showing -> LOUD.
// One mid-write blip never flashes an alarm; a real outage surfaces within ~N polls.
//
// The fetcher does the per-feed transform and returns `{ stale, data }` — the server's
// own stale flag (its file-read/parse guard) maps straight onto state 3, and a thrown
// transport error is state 3 too. `hasContent` lets a feed whose "data" is a non-null
// container (an array, a Map-bearing object) still count as empty for the LOUD test
// (e.g. an empty knock-queue: present but nothing to keep showing).

export interface HonestFeed<T> {
    data: T | null;
    unreachable: boolean;
}

interface HonestFeedOptions<T> {
    intervalMs?: number;
    unreachableAfter?: number;
    // Does this (non-null) data have anything worth keeping on screen? Defaults to
    // "any non-null data counts". Feeds whose empty state is a present-but-empty
    // container override it (e.g. items.length > 0) so an emptied feed still goes LOUD.
    hasContent?: (data: T) => boolean;
}

const DEFAULT_INTERVAL_MS = 5000;
// Go loud only after a few consecutive failures so a single mid-write blip doesn't
// flash an alarm — but a real outage surfaces within ~15s instead of staying dark.
const DEFAULT_UNREACHABLE_AFTER = 3;

export function useHonestFeed<T>(
    fetcher: (credentials: AuthCredentials) => Promise<{ stale: boolean; data: T | null }>,
    options?: HonestFeedOptions<T>,
): HonestFeed<T> {
    const intervalMs = options?.intervalMs ?? DEFAULT_INTERVAL_MS;
    const unreachableAfter = options?.unreachableAfter ?? DEFAULT_UNREACHABLE_AFTER;

    const [state, setState] = React.useState<HonestFeed<T>>({ data: null, unreachable: false });
    const failures = React.useRef(0);
    // Keep the latest fetcher/predicate live without re-subscribing the poll loop on
    // every render (the closures the caller passes are recreated each render).
    const fetcherRef = React.useRef(fetcher);
    fetcherRef.current = fetcher;
    const hasContentRef = React.useRef(options?.hasContent);
    hasContentRef.current = options?.hasContent;

    React.useEffect(() => {
        let mounted = true;
        let timer: ReturnType<typeof setTimeout> | null = null;

        const contentful = (data: T | null): boolean => {
            if (data == null) return false;
            const pred = hasContentRef.current;
            return pred ? pred(data) : true;
        };

        const markFailure = () => {
            failures.current += 1;
            if (!mounted) return;
            setState((prev) => {
                // LOUD only when there's nothing real to keep showing — a stale read
                // with content still up keeps showing it, quietly.
                const loud = failures.current >= unreachableAfter && !contentful(prev.data);
                return prev.unreachable === loud ? prev : { ...prev, unreachable: loud };
            });
        };

        const poll = async () => {
            try {
                const credentials = await TokenStorage.getCredentials();
                if (mounted && credentials) {
                    const res = await fetcherRef.current(credentials);
                    if (mounted && !res.stale) {
                        // Authoritative fresh read (content OR a genuine empty) -> adopt.
                        failures.current = 0;
                        setState({ data: res.data, unreachable: false });
                    } else if (mounted) {
                        markFailure();
                    }
                }
            } catch {
                markFailure();
            } finally {
                if (mounted) {
                    timer = setTimeout(poll, intervalMs);
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
    }, [intervalMs, unreachableAfter]);

    return state;
}
