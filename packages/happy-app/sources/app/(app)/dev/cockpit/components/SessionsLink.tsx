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
//   + _layout name="sessions/index").
// - The `as never` cast is a KNOWN-ISSUE bridge, NOT a mask: expo-router's
//   generated typed-route union (.expo/types/router.d.ts) is polluted because the
//   cockpit component modules currently live UNDER sources/app/ (the router root),
//   so every module registers as a phantom route and crowds `/sessions` out of the
//   union. The runtime target is correct; only the generated types are wrong.
//   TRACKED FOLLOW-UP (CKP-23): relocate sources/app/(app)/dev/cockpit/ →
//   sources/cockpit/ (needs a Metro restart), which regenerates a clean union and
//   lets this cast be removed. See the cockpit-devops thread.
// - visible "Sessions" label so the path stays discoverable even if the icon
//   font ever fails to load again (dev surface — i18n-exempt by convention).

export const SessionsLink = React.memo(function SessionsLink() {
    const router = useRouter();
    const { theme } = useUnistyles();
    return (
        <Pressable
            hitSlop={8}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see CKP-23 note above
            onPress={() => router.push('/sessions' as never)}
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
