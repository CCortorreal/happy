import * as React from 'react';
// es6 variant: feeds may carry Map/Set/Date payloads (e.g. useCongressRoster's
// `sessions: Map<...>`) — the base export compares those by own-enumerable-keys
// only (two distinct Maps both read as "no keys" -> false-equal), which would
// mask a real change. es6 walks Map/Set entries correctly; same package, no new dep.
import equal from 'fast-deep-equal/es6';
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
// A poll that never settles (mesh-hung, nothing listening) is the failure mode a bare
// `await fetcher()` can't see — it's neither resolved nor rejected, so it must be raced
// against a deadline shorter than the poll interval and forced to count as a failure.
const POLL_TIMEOUT_MS = 4000;

export function useHonestFeed<T>(
    fetcher: (credentials: AuthCredentials, signal?: AbortSignal) => Promise<{ stale: boolean; data: T | null }>,
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
            // Per-poll AbortController: if the deadline fires before the fetch settles,
            // the underlying request is truly cancelled (not just orphaned). Without
            // this, a slow backend leaves lingering fetches whose late responses can
            // still resolve into stale-flag territory long after we already gave up.
            const controller = new AbortController();
            let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
            try {
                const credentials = await TokenStorage.getCredentials();
                if (mounted && credentials) {
                    // Race the fetch against a deadline so a HANGING (not refused) backend
                    // still settles as a failure — without this, a pending promise is neither
                    // success nor failure and `unreachable` never flips. On timeout, abort()
                    // fires so the underlying fetch is actually torn down.
                    const timeout = new Promise<never>((_, reject) => {
                        timeoutHandle = setTimeout(() => {
                            controller.abort();
                            reject(new Error('poll timeout'));
                        }, POLL_TIMEOUT_MS);
                    });
                    const res = await Promise.race([fetcherRef.current(credentials, controller.signal), timeout]);
                    if (mounted && !res.stale) {
                        // Authoritative fresh read (content OR a genuine empty) -> adopt.
                        failures.current = 0;
                        setState((prev) => {
                            // PR-22 de-flicker: a poll that is semantically identical to the
                            // last-good payload keeps the PRIOR object reference instead of
                            // adopting the new one. This is a reference-stability optimization
                            // ONLY — the comparison is deep-equal, so a genuine change (any
                            // actual value difference) always adopts immediately, same as
                            // before. It exists so a `useMemo` downstream (e.g. useVram) that
                            // depends on `data` doesn't recompute every 5s for zero semantic
                            // change; it must never mask a real change (would violate the
                            // honesty-spine this hook exists to enforce).
                            if (!prev.unreachable && equal(prev.data, res.data)) {
                                return prev;
                            }
                            return { data: res.data, unreachable: false };
                        });
                    } else if (mounted) {
                        markFailure();
                    }
                }
            } catch {
                markFailure();
            } finally {
                // Clear the timeout handle so a settled-before-deadline poll doesn't
                // leave a dangling abort() firing on the next tick.
                if (timeoutHandle !== null) {
                    clearTimeout(timeoutHandle);
                }
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
