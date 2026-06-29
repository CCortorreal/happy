import * as React from 'react';
import { getWarden } from '@/sync/apiWarden';
import { WardenItem } from '@/sync/wardenTypes';
import { useHonestFeed } from '@/hooks/useHonestFeed';

// useWarden — Hearth P1 (the knock-cards).
//
// A thin adapter over useHonestFeed (the #0-invariant primitive): polls GET /v1/warden
// and inherits the three-state discipline. This matters MORE here than on a gauge — the
// knock-cards are an ACTION surface, so a dead feed silently reading "nothing pending"
// is the worst case (Carlos believes he's all-clear while the Warden can't reach him,
// and answers wouldn't send). `hasContent` treats an EMPTY queue as nothing-to-keep, so
// an emptied feed that then goes unreachable still escalates LOUD rather than masking as
// a calm "all clear".

const EMPTY_ITEMS: WardenItem[] = [];

export function useWarden(): { items: WardenItem[]; unreachable: boolean } {
    const { data, unreachable } = useHonestFeed<WardenItem[]>(
        async (credentials) => {
            const response = await getWarden(credentials);
            return { stale: response.stale, data: response.stale ? null : response.items };
        },
        { hasContent: (items) => items.length > 0 },
    );
    return React.useMemo(() => ({ items: data ?? EMPTY_ITEMS, unreachable }), [data, unreachable]);
}
