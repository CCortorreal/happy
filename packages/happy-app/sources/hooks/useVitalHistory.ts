import * as React from 'react';

// useVitalHistory — the sparkline ring buffer behind each VitalGaugeCard (CKP-15).
//
// A MODULE-LEVEL (not per-mount) ring buffer keyed by VitalKey: the last N accepted
// polls per feed survive a card unmount/remount so the sparkline isn't wiped every time
// the cockpit re-lays-out. Values are appended on SETTLED reads ONLY — never on an
// unreachable/binding poll (a dead feed must not smear its last-known bar across the
// spark as if it were still ticking; honest-state discipline: absent data renders absent).
//
// The hook is a thin subscriber: it pushes `currentValue` into the shared buffer when it
// changes (and is non-null), then returns the current window so the card can render it.
// A null `currentValue` (BINDING / DEAD / no fresh read) is a no-op — the window holds
// only real reads, so the newest slot is always a value that was actually observed.

export type VitalKey = 'vram' | 'disk' | 'context' | 'backlog';

const MAX_SAMPLES = 30;

// Module-level ring buffers — one per key, shared across every mount of a given card.
const buffers: Record<VitalKey, number[]> = {
    vram: [],
    disk: [],
    context: [],
    backlog: [],
};

// A monotonic version per key so a subscriber re-renders when the shared buffer mutates
// (the buffer is module-level, outside React's tree, so we bump a counter to signal it).
const versions: Record<VitalKey, number> = {
    vram: 0,
    disk: 0,
    context: 0,
    backlog: 0,
};

function pushSample(key: VitalKey, value: number): void {
    const buf = buffers[key];
    buf.push(value);
    if (buf.length > MAX_SAMPLES) {
        buf.splice(0, buf.length - MAX_SAMPLES);
    }
    versions[key] += 1;
}

export function useVitalHistory(key: VitalKey, currentValue: number | null): number[] {
    const [, forceRender] = React.useReducer((n: number) => n + 1, 0);
    // Track the last value we appended for THIS mount so an unchanged value doesn't spam
    // the buffer every poll — the buffer represents distinct accepted reads.
    const lastPushed = React.useRef<number | null>(null);

    React.useEffect(() => {
        // Append only genuine fresh reads (non-null). A repeated identical value still
        // counts as a real observed tick, but we de-dup consecutive identical pushes so a
        // static feed doesn't fill the whole window with one flat number in a single burst
        // — it advances one slot per distinct settled read, which is the honest cadence.
        if (currentValue == null) {
            return;
        }
        if (lastPushed.current === currentValue) {
            return;
        }
        lastPushed.current = currentValue;
        pushSample(key, currentValue);
        forceRender();
    }, [key, currentValue]);

    // Return a copy so the caller can't mutate the shared buffer; version in deps so a
    // push from THIS mount re-renders (cross-mount pushes are rare — same feed rarely has
    // two live cards — and self-heal on the next poll).
    return React.useMemo(() => buffers[key].slice(), [key, versions[key], currentValue]);
}
