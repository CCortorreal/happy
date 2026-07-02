import * as React from 'react';
import { useSessionMessages } from '@/sync/storage';
import { sync } from '@/sync/sync';
import { Message } from '@/sync/typesMessage';

// useLaneTail — cockpit-v2 live output stream (VISION check 7 machine gate).
//
// Subscribes to the SAME live message store the session chat screen reads
// (useSessionMessages), so a lane tile's expanded tail is a real live stream,
// not the oracle's lastAssistantText snapshot. Maps the last ~30 messages to a
// lean render shape.
//
// LOADING: useSessionMessages only returns data once something has actually
// invalidated that session's messages sync — the store starts empty for a
// session whose chat screen was never opened. The chat screen (SessionView.tsx)
// triggers that load via `sync.onSessionVisible(sessionId)` in a useLayoutEffect
// on mount. There is no separate "just fetch messages" entrypoint — this hook
// calls the exact same `sync.onSessionVisible` when a tile expands (sessionId
// becomes non-null) so the tail populates the same way opening the chat would.
// Subscription itself (useSessionMessages) is NOT automatic — without this call
// a lane whose chat was never opened would show "no output yet" forever even
// though the session has history.
const TAIL_LIMIT = 30;

export interface LaneTailItem {
    id: string;
    kind: Message['kind'];
    text: string;
    createdAt: number;
}

export interface LaneTail {
    items: LaneTailItem[];
    isLoaded: boolean;
}

function summarize(message: Message): string {
    switch (message.kind) {
        case 'user-text':
            return `> ${message.displayText ?? message.text}`;
        case 'agent-text':
            return message.text;
        case 'tool-call':
            return `⚙ ${message.tool.name}`;
        case 'agent-event':
            return `· ${message.event.type}`;
        default:
            return '';
    }
}

export function useLaneTail(sessionId: string | null | undefined): LaneTail {
    const { messages, isLoaded } = useSessionMessages(sessionId ?? '');

    // Fire the same loader the chat screen fires on mount, but only once per
    // expanded sessionId — mirrors SessionView's useLayoutEffect trigger so a
    // tile that's never been opened as a full chat still gets a populated tail.
    React.useEffect(() => {
        if (!sessionId) return;
        sync.onSessionVisible(sessionId);
    }, [sessionId]);

    const items = React.useMemo<LaneTailItem[]>(() => {
        if (!sessionId) return [];
        // messages arrive newest-first from the store; keep the last TAIL_LIMIT
        // and reverse so the tail reads oldest -> newest (natural reading order).
        const tail = messages.slice(0, TAIL_LIMIT);
        return tail
            .map((m) => ({
                id: m.id,
                kind: m.kind,
                text: summarize(m),
                createdAt: m.createdAt,
            }))
            .reverse();
    }, [messages, sessionId]);

    return {
        items,
        isLoaded: !!sessionId && isLoaded,
    };
}
