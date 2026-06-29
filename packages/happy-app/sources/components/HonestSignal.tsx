import * as React from 'react';
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

export function FeedUnreachable({ message }: { message: string }) {
    return (
        <Text style={styles.feedUnreachable} numberOfLines={2}>{message}</Text>
    );
}

const styles = StyleSheet.create((theme) => ({
    feedUnreachable: {
        fontSize: 12,
        // The destructive TOKEN, not a hardcoded red — honest-dead reads the same
        // across light/dark and stays consistent with the rest of the cockpit.
        color: theme.colors.textDestructive,
        ...Typography.default('semiBold'),
    },
}));
