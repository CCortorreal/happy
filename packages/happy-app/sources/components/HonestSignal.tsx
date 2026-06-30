import * as React from 'react';
import { View } from 'react-native';
import { Text } from '@/components/StyledText';
import { StyleSheet } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';

// HonestSignal — the render half of the Hearth's #0 invariant (NEVER EMIT A CONFIDENT
// LIE), the shared CROSS-PILLAR render rule. Where useHonestFeed enforces the honesty
// in the DATA (stale≠fresh / dead≠alive), this module owns the VISUAL grammar so every
// pillar speaks the same dialect:
//   - stale≠fresh / dead≠alive -> FeedUnreachable (a dead feed looks dead, in the
//     destructive color TOKEN — never a calm blank that reads as the all-clear);
//   - staged≠applied  -> (future) a "preview / not yet run" mark for the free-button
//     and any other previewed action;
//   - built≠live      -> (future) a "committed, not deployed" mark for anything shipped
//     but not yet running.
// Lightweight pillar: pure text + a theme token, no render engine, warm-pixel via
// unistyles. Message-agnostic (the caller supplies the words) so it's i18n-neutral and
// reusable across gauges.
//
// PR-20: optional `minHeight` so the banner can own the SAME reserved height as the
// gauge card it replaces — not just rely on the caller's outer container matching it.
// Centers the message in that floor so the dead-state reads calm-but-honest, never a
// short stub sitting at the top of a tall, mostly-empty card.

export function FeedUnreachable({ message, minHeight }: { message: string; minHeight?: number }) {
    return (
        <View style={[styles.wrap, minHeight != null && { minHeight, justifyContent: 'center' }]}>
            <Text style={styles.feedUnreachable} numberOfLines={2}>{message}</Text>
        </View>
    );
}

const styles = StyleSheet.create((theme) => ({
    wrap: {
        width: '100%',
    },
    feedUnreachable: {
        fontSize: 12,
        // The destructive TOKEN, not a hardcoded red — honest-dead reads the same
        // across light/dark and stays consistent with the rest of the cockpit.
        color: theme.colors.textDestructive,
        ...Typography.default('semiBold'),
    },
}));
