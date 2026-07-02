import * as React from 'react';
import { Pressable, Text } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { useUnistyles } from 'react-native-unistyles';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

// SessionsLink — the sole path from the cockpit landing surface to the classic
// session list. Extracted from the shell's inline topBarRow button (CKP-06/07):
// - href is '/sessions' (the route's URL) — NOT '/sessions/index' (the internal
//   route NAME), which expo-router writes literally on web → Unmatched Route.
//   Verified at runtime: matchers.js strips `/index`, so `sessions/index.tsx`
//   resolves to `/sessions`; pushing `/sessions/index` on web → Unmatched Route.
//   `/sessions` IS a real registered route (sources/app/(app)/sessions/index.tsx
//   + _layout name="sessions/index") and is a clean typed href — the cockpit
//   modules now live OUTSIDE the router root (sources/cockpit/, CKP-23 done), so
//   the generated route union is no longer polluted and no cast is needed.
// - visible "Sessions" label so the path stays discoverable even if the icon
//   font ever fails to load again (dev surface — i18n-exempt by convention).

export const SessionsLink = React.memo(function SessionsLink() {
    const router = useRouter();
    const { theme } = useUnistyles();
    return (
        <Pressable
            hitSlop={8}
            onPress={() => router.push('/sessions')}
            style={styles.button}
            accessibilityRole="button"
            accessibilityLabel="Classic session list"
        >
            <Ionicons name="list" size={18} color={theme.colors.text} />
            <Text style={styles.label}>Sessions</Text>
        </Pressable>
    );
});

const styles = StyleSheet.create((theme) => ({
    button: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        minHeight: 44,
        paddingHorizontal: 12,
        marginLeft: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.divider,
        backgroundColor: theme.colors.surface,
    },
    label: {
        fontSize: 13,
        color: theme.colors.text,
    },
}));
