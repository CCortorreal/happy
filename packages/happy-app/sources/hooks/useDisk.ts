import * as React from 'react';
import { getDisk } from '@/sync/apiDisk';
import { DiskView } from '@/sync/diskTypes';
import { useHonestFeed } from '@/hooks/useHonestFeed';

// useDisk — Hearth MONITOR pillar (the disk-resilience gauge feed).
//
// A thin adapter over useHonestFeed (the #0-invariant primitive): polls GET /v1/disk
// and inherits the three-state discipline (render / quiet / LOUD-unreachable, keep-
// last-good). The server's `stale` flag — which fires on a too-old reading (disk's
// ts-age backstop) — maps onto the LOUD path, so a frozen disk-sentinel reads loud
// rather than serving fake-fresh free space. Disk changes slowly, so poll lazily.
//
// NB: a single box being unreachable is DATA (reachable:false on the box), distinct
// from the whole feed being LOUD — the gauge renders the former as "blind to this box".

const POLL_INTERVAL_MS = 30000;   // disk moves slowly; idle-cheap polling

export function useDisk(): { view: DiskView | null; unreachable: boolean } {
    const { data, unreachable } = useHonestFeed<DiskView>(
        async (credentials, signal) => {
            const response = await getDisk(credentials, signal);
            return { stale: response.stale, data: response.stale ? null : response.view };
        },
        {
            intervalMs: POLL_INTERVAL_MS,
            // hasContent — closes G13 (permanently-dead-feed regression): the
            // DiskView shape is a `{ thresholds, boxes: [] }` container, so a
            // present-but-empty projection (no boxes probed) reads as fresh-empty.
            // Without this, one successful read pins `unreachable` false forever;
            // with it, an empty-boxes feed that then dies still escalates LOUD.
            hasContent: (view) => view.boxes.length > 0,
        },
    );
    return React.useMemo(() => ({ view: data, unreachable }), [data, unreachable]);
}
