import * as React from 'react';
import { View, Pressable, ScrollView, LayoutAnimation, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { Text } from '@/components/StyledText';
import { StyleSheet } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { Avatar } from '@/components/Avatar';
import { StatusDot } from '@/components/StatusDot';
import { FeedUnreachable } from '@/components/HonestSignal';
import { useCongressRelay } from '@/hooks/useCongressRelay';
import { useCongressRoster } from '@/hooks/useCongressRoster';
import { CongressRelayItem } from '@/sync/congressRelayTypes';
import { CongressSeat } from '@/sync/congressTypes';
import { deriveLiveness } from '@/sync/liveness';
import { GREY, ACCENT_CAGE, isDimmed } from '../colors';
import { useDensity, scaled } from '../density';

// ============================================================================
// PLANE 4 — RELAY (mission A3 + NOC graft 1/11). Newest-last inter-seat
// message feed, mono style matching the lane tail. Boring-when-healthy: an
// empty relay is a quiet line; a dead feed is honest-empty (FeedUnreachable),
// never a fake row.
//
// GRAFT 1 — the cage MEMBRANE: a row where EXACTLY one endpoint resolves to a
// sealed seat gets a 2px teal left border — traffic crossing the cage boundary
// reads differently from intra-host or intra-cage chatter. Keyed off
// cage_status (NEVER name prefixes); an endpoint that resolves to no roster
// seat is UNKNOWN, not sealed — no membrane on unknowns.
//
// GRAFT 11 — rail variant auto-sticks to bottom ONLY when already at bottom, so
// a newest-last append never yanks the scroll out from under a human reading
// older traffic.
// ============================================================================

const RELAY_DESKTOP_VISIBLE = 8;
const RELAY_RAIL_VISIBLE = 30;

// Resolve a relay endpoint (a seat id string) to its roster seat, if any. An
// endpoint that matches no seat is UNKNOWN — we never treat it as sealed.
function endpointSeat(id: string, seatById: Map<string, CongressSeat>): CongressSeat | undefined {
    return seatById.get(id);
}

function EndpointChip({ id, seatById, rosterUnreachable }: {
    id: string;
    seatById: Map<string, CongressSeat>;
    rosterUnreachable: boolean;
}) {
    const seat = endpointSeat(id, seatById);
    const verdict = seat ? deriveLiveness(seat, rosterUnreachable).verdict : null;
    // Unknown endpoint: a neutral (colored) face — we know nothing dead about it,
    // so we don't drain it, and it's not sealed (no square).
    const dimmed = verdict != null ? isDimmed(verdict) : false;
    const sealed = seat?.cage_status === 'sealed';
    return <Avatar id={id} size={12} monochrome={dimmed} square={sealed} />;
}

function RelayRow({ item, typeScale, seatById, rosterUnreachable }: {
    item: CongressRelayItem;
    typeScale: number;
    seatById: Map<string, CongressSeat>;
    rosterUnreachable: boolean;
}) {
    const ts = item.ts != null ? new Date(item.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--:--';

    // GRAFT 1 membrane — exactly ONE sealed endpoint = boundary-crossing traffic.
    const fromSealed = endpointSeat(item.from, seatById)?.cage_status === 'sealed';
    const toSealed = endpointSeat(item.to, seatById)?.cage_status === 'sealed';
    const crossesMembrane = fromSealed !== toSealed;

    return (
        <View style={[styles.relayRow, crossesMembrane && styles.relayRowMembrane]}>
            <View style={styles.relayChips}>
                <EndpointChip id={item.from} seatById={seatById} rosterUnreachable={rosterUnreachable} />
                <Text style={[styles.relayArrow, { fontSize: scaled(11, typeScale) }]}>→</Text>
                <EndpointChip id={item.to} seatById={seatById} rosterUnreachable={rosterUnreachable} />
            </View>
            <Text style={[styles.relayRowText, { fontSize: scaled(12, typeScale) }]} numberOfLines={1}>
                {ts} · {item.excerpt}
            </Text>
        </View>
    );
}

export function RelayPlane({ variant = 'stack' }: {
    // 'stack' (default) = today's behavior byte-for-byte. 'rail' = the desktop
    // NOC right-rail variant: flex-fills, own nested scroll, ~30 rows, avatar
    // chips + cage-membrane borders, auto-stick-to-bottom only when at bottom.
    variant?: 'stack' | 'rail';
} = {}) {
    const d = useDensity();
    const { items, unreachable } = useCongressRelay();
    const { sessions, workers } = useCongressRoster();
    const [phoneExpanded, setPhoneExpanded] = React.useState(false);

    // seat.seat -> seat, for endpoint resolution (dedupe the dual-keyed sessions
    // map by seat id, then workers).
    const seatById = React.useMemo(() => {
        const m = new Map<string, CongressSeat>();
        for (const s of sessions.values()) m.set(s.seat, s);
        for (const s of workers) m.set(s.seat, s);
        return m;
    }, [sessions, workers]);

    // GRAFT 11 — rail auto-stick. Track whether the view is currently pinned to
    // the bottom; only auto-scroll on new items when it is.
    const scrollRef = React.useRef<ScrollView | null>(null);
    const atBottomRef = React.useRef(true);
    const onScroll = React.useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
        const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
        atBottomRef.current = distanceFromBottom < 24;
    }, []);
    React.useEffect(() => {
        if (variant === 'rail' && atBottomRef.current) {
            // Only stick when the reader is already at the bottom — never yank.
            scrollRef.current?.scrollToEnd({ animated: true });
        }
    }, [items.length, variant]);

    // Honest empty state: nothing to relay AND the feed isn't unreachable ->
    // the calm all-clear line.
    if (items.length === 0 && !unreachable) {
        return (
            <View style={variant === 'rail' ? styles.railPlane : [styles.plane, { marginBottom: d.planeGap }]}>
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
            <View style={variant === 'rail' ? styles.railPlane : [styles.plane, { marginBottom: d.planeGap }]}>
                <Text style={[styles.planeTitle, { fontSize: scaled(13, d.typeScale) }]}>RELAY</Text>
                <View style={[styles.unreachableCard, { borderRadius: d.cardRadius, paddingVertical: d.cardPaddingV, paddingHorizontal: d.cardPaddingH }]}>
                    <FeedUnreachable message="can't reach the relay log" />
                </View>
            </View>
        );
    }

    // RAIL variant (desktop right rail) — flex-fills, own nested scroll, ~30
    // rows, avatar chips + membrane borders, auto-stick-to-bottom (graft 11).
    if (variant === 'rail') {
        const railVisible = items.slice(-RELAY_RAIL_VISIBLE);
        return (
            <View style={styles.railPlane}>
                <Text style={[styles.planeTitle, { fontSize: scaled(13, d.typeScale) }]}>RELAY · {items.length}</Text>
                <ScrollView
                    ref={scrollRef}
                    style={styles.railScroll}
                    contentContainerStyle={styles.railScrollContent}
                    nestedScrollEnabled
                    onScroll={onScroll}
                    scrollEventThrottle={64}
                >
                    {railVisible.map((item) => (
                        <RelayRow key={item.id} item={item} typeScale={d.typeScale} seatById={seatById} rosterUnreachable={unreachable} />
                    ))}
                </ScrollView>
            </View>
        );
    }

    // Phone: collapsed-by-default section, tap the header to expand.
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
                    {desktopVisible.map((item) => (
                        <RelayRow key={item.id} item={item} typeScale={d.typeScale} seatById={seatById} rosterUnreachable={unreachable} />
                    ))}
                </ScrollView>
            ) : (
                items.slice(-4).map((item) => (
                    <RelayRow key={item.id} item={item} typeScale={d.typeScale} seatById={seatById} rosterUnreachable={unreachable} />
                ))
            )}
        </View>
    );
}

const styles = StyleSheet.create((theme) => ({
    plane: {
        marginBottom: 24,
    },
    // Rail variant flex-fills its column (own nested scroll ~30 rows).
    railPlane: {
        flex: 1,
        minHeight: 0,
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
    // LOUD-but-considered: a dead feed gets a card, not a bare line.
    unreachableCard: {
        backgroundColor: theme.colors.surface,
        borderLeftWidth: 3,
        borderLeftColor: theme.colors.textDestructive,
    },

    // --- RELAY plane (mission A3 + NOC) ---
    relayScroll: {
        maxHeight: 200,
    },
    railScroll: {
        flex: 1,
        minHeight: 0,
    },
    railScrollContent: {
        paddingBottom: 8,
    },
    relayRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 3,
        paddingLeft: 4,
    },
    // GRAFT 1 membrane — a 2px teal left border on boundary-crossing traffic.
    relayRowMembrane: {
        borderLeftWidth: 2,
        borderLeftColor: ACCENT_CAGE,
        paddingLeft: 6,
    },
    relayChips: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
    },
    relayArrow: {
        fontSize: 11,
        color: theme.colors.textSecondary,
        ...Typography.default(),
    },
    relayRowText: {
        flex: 1,
        fontSize: 12,
        lineHeight: 17,
        color: theme.colors.text,
        ...Typography.mono(),
    },
}));
