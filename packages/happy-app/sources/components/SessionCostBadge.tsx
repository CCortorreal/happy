import * as React from 'react';
import { Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { useSessionCost } from '@/hooks/useSessionCost';

/**
 * SessionCostBadge — compact live USD cost readout for the session header chrome.
 *
 * The cost surface for the lightweight (Tauri/WebView2) daily driver. Reads the
 * server-aggregated, already-priced cost via `useSessionCost` (the one source of
 * cost truth shared with the Usage panel) and tints by tier:
 *   normal (muted) · soft (>= $5, amber) · high (>= $25, critical red).
 * Renders nothing until the first value lands so the header never shows a
 * loading state and the layout never flickers (app principle: never show a
 * loading error, always just retry).
 */
export const SessionCostBadge = React.memo(({ sessionId }: { sessionId: string }) => {
    const { theme } = useUnistyles();
    const { cost, tier, loading } = useSessionCost(sessionId);

    if (loading && cost === 0) {
        return null;
    }

    const color = tier === 'high'
        ? theme.colors.warningCritical
        : tier === 'soft'
            ? '#FF9500' // amber — no dedicated theme token for the soft tier
            : theme.colors.textSecondary;

    return (
        <Pressable
            style={styles.container}
            hitSlop={8}
            onPress={() => router.push('/settings/usage')}
            accessibilityRole="button"
        >
            <Text
                style={[Typography.default('semiBold'), styles.text, { color }]}
                numberOfLines={1}
            >
                {`$${cost.toFixed(2)}`}
            </Text>
        </Pressable>
    );
});

const styles = StyleSheet.create((theme) => ({
    container: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 8,
        backgroundColor: theme.colors.surfaceHigh,
    },
    text: {
        fontSize: 13,
        fontVariant: ['tabular-nums'],
    },
}));
