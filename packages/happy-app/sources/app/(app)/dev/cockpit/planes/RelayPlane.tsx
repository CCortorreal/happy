import * as React from 'react';
import { View, Pressable, ScrollView, LayoutAnimation } from 'react-native';
import { Text } from '@/components/StyledText';
import { StyleSheet } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { StatusDot } from '@/components/StatusDot';
import { FeedUnreachable } from '@/components/HonestSignal';
import { useCongressRelay } from '@/hooks/useCongressRelay';
import { CongressRelayItem } from '@/sync/congressRelayTypes';
import { GREY } from '../colors';
import { useDensity, scaled } from '../density';

// ============================================================================
// PLANE 4 — RELAY (mission A3). Newest-last inter-seat message feed, mono
// style matching the lane tail. Boring-when-healthy: an empty relay is a
// quiet line, never an empty labeled box; a dead feed is honest-empty (the
// feed's own stale/unreachable state degrades to zero items, not a fake row —
// see apiCongressRelay.ts/useCongressRelay.ts). Density-aware: desktop shows
// the last ~8 with scroll, phone collapses to a tap-to-expand section.
// ============================================================================

const RELAY_DESKTOP_VISIBLE = 8;

function RelayRow({ item, typeScale }: { item: CongressRelayItem; typeScale: number }) {
    const ts = item.ts != null ? new Date(item.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--:--';
    return (
        <Text style={[styles.relayRowText, { fontSize: scaled(12, typeScale) }]} numberOfLines={1}>
            {ts} · {item.from} → {item.to} · {item.excerpt}
        </Text>
    );
}

export function RelayPlane() {
    const d = useDensity();
    const { items, unreachable } = useCongressRelay();
    const [phoneExpanded, setPhoneExpanded] = React.useState(false);

    // Honest empty state: nothing to relay AND the feed isn't unreachable ->
    // the calm all-clear line, same pattern as NeedsYouPlane's quiet state.
    if (items.length === 0 && !unreachable) {
        return (
            <View style={[styles.plane, { marginBottom: d.planeGap }]}>
                <Text style={[styles.planeTitle, { fontSize: scaled(13, d.typeScale) }]}>RELAY</Text>
                <View style={styles.quietLineRow}>
                    <StatusDot color={GREY} size={6} />
                    <Text style={[styles.quietLine, { fontSize: scaled(13, d.typeScale) }]}>No relay traffic</Text>
                </View>
            </View>
        );
    }

    if (items.length === 0 && unreachable) {
        return (
            <View style={[styles.plane, { marginBottom: d.planeGap }]}>
                <Text style={[styles.planeTitle, { fontSize: scaled(13, d.typeScale) }]}>RELAY</Text>
                <View style={[styles.unreachableCard, { borderRadius: d.cardRadius, paddingVertical: d.cardPaddingV, paddingHorizontal: d.cardPaddingH }]}>
                    <FeedUnreachable message="can't reach the relay log" />
                </View>
            </View>
        );
    }

    // Phone: collapsed-by-default section, tap the header to expand (mirrors
    // VitalsStrip's tap-to-expand gauge pattern rather than a new toggle idiom).
    if (d.density === 'phone' && !phoneExpanded) {
        return (
            <View style={[styles.plane, { marginBottom: d.planeGap }]}>
                <Pressable onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setPhoneExpanded(true); }}>
                    <Text style={[styles.planeTitle, { fontSize: scaled(13, d.typeScale) }]}>RELAY · {items.length} · tap to expand</Text>
                </Pressable>
            </View>
        );
    }

    const desktopVisible = items.slice(-RELAY_DESKTOP_VISIBLE);

    return (
        <View style={[styles.plane, { marginBottom: d.planeGap }]}>
            <Pressable disabled={d.density !== 'phone'} onPress={() => setPhoneExpanded(false)}>
                <Text style={[styles.planeTitle, { fontSize: scaled(13, d.typeScale) }]}>RELAY · {items.length}</Text>
            </Pressable>
            {d.density === 'desktop' ? (
                <ScrollView style={styles.relayScroll} nestedScrollEnabled>
                    {desktopVisible.map((item) => <RelayRow key={item.id} item={item} typeScale={d.typeScale} />)}
                </ScrollView>
            ) : (
                items.slice(-4).map((item) => <RelayRow key={item.id} item={item} typeScale={d.typeScale} />)
            )}
        </View>
    );
}

const styles = StyleSheet.create((theme) => ({
    plane: {
        marginBottom: 24,
    },
    planeTitle: {
        fontSize: 13,
        color: theme.colors.groupped.sectionTitle,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 10,
        marginLeft: 4,
        ...Typography.default('semiBold'),
    },
    // Boring-when-healthy: a thin quiet line, never an empty labeled box.
    quietLineRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 8,
        paddingHorizontal: 4,
    },
    quietLine: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        ...Typography.default(),
    },
    // LOUD-but-considered: a dead feed gets a card, not a bare line — the destructive
    // TOKEN border makes it unmissable without inventing a second alarm color.
    unreachableCard: {
        backgroundColor: theme.colors.surface,
        borderLeftWidth: 3,
        borderLeftColor: theme.colors.textDestructive,
    },

    // --- RELAY plane (mission A3) ---
    relayScroll: {
        maxHeight: 200,
    },
    relayRowText: {
        fontSize: 12,
        lineHeight: 17,
        color: theme.colors.text,
        marginBottom: 2,
        ...Typography.mono(),
    },
}));
