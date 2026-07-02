import * as React from 'react';
import { View, Pressable, LayoutAnimation } from 'react-native';
import { Text } from '@/components/StyledText';
import { StyleSheet } from 'react-native-unistyles';
import { Ionicons } from '@expo/vector-icons';
import { Typography } from '@/constants/Typography';
import { StatusDot } from '@/components/StatusDot';
import { useCongressRoster } from '@/hooks/useCongressRoster';
import { deriveLiveness } from '@/sync/liveness';
import { CongressSeat } from '@/sync/congressTypes';
import { CockpitSelectionContext } from '../selection';
import { RosterLedger } from './RosterLedger';
import { GREEN, GREY, RED, ACCENT_CAGE } from '../colors';
import { useDensity, scaled } from '../density';

// ============================================================================
// HEADER — considered identity for the unified command surface. Title +
// live-seat-count + a status dot, no cheesy branding. The dot/count are
// derived from the SAME roster feed + deriveLiveness verdict every lane tile
// already uses (never a second, independent "is it healthy" computation).
//
// CKP-13 — the `N of M live` chip is now a Pressable with a chevron:
//   - desktop → clear() the selection context (drops Column B to the
//     RosterLedger empty state, so the ledger IS the drill-in).
//   - deck/phone → inline-expand a <RosterLedger inline/> directly under the
//     header (no operator pane at those postures).
//
// GRAFT 2 — the cage chip: after the live count, a lock glyph + `N sealed` in
// teal. ABSENT entirely at zero (never `0 sealed` — teal noise for no cages).
// `cage: down` in RED when a cage-ROOT seat (min depth in its cage_id group) is
// dead — a dead warden is loud, not a calm teal count.
// ============================================================================

export function CockpitHeader() {
    const d = useDensity();
    const { sessions, workers, unreachable } = useCongressRoster();
    const selection = React.useContext(CockpitSelectionContext);
    const [inlineOpen, setInlineOpen] = React.useState(false);

    const { liveCount, totalCount, freshCount, sealedCount, cageDown } = React.useMemo(() => {
        // Dedupe sessions (dual-keyed) by seat id before counting, then workers.
        const seen = new Set<string>();
        const seats: CongressSeat[] = [];
        for (const s of sessions.values()) {
            if (seen.has(s.seat)) continue;
            seen.add(s.seat);
            seats.push(s);
        }
        for (const s of workers) {
            if (seen.has(s.seat)) continue;
            seen.add(s.seat);
            seats.push(s);
        }

        let live = 0;
        let fresh = 0;
        let sealed = 0;
        for (const seat of seats) {
            const { verdict } = deriveLiveness(seat, unreachable);
            // "live" = identity-proven PRESENT (alive / idle / wedged) — the same
            // tier boundary the tiles paint as non-dead. Turn-freshness ('alive')
            // drives the pulse, NOT the count.
            if (verdict === 'alive' || verdict === 'idle' || verdict === 'wedged') live += 1;
            if (verdict === 'alive') fresh += 1;
            if (seat.cage_status === 'sealed') sealed += 1;
        }

        // GRAFT 2 — is any cage-ROOT dead? Cage-root = the min-depth seat within
        // each cage_id group. A dead warden makes the header read `cage: down`.
        const minDepthByCage = new Map<string, { depth: number; seat: CongressSeat }>();
        for (const seat of seats) {
            if (seat.cage_status !== 'sealed' || seat.cage_id == null) continue;
            const cur = minDepthByCage.get(seat.cage_id);
            if (!cur || seat.depth < cur.depth) {
                minDepthByCage.set(seat.cage_id, { depth: seat.depth, seat });
            }
        }
        let down = false;
        for (const { seat } of minDepthByCage.values()) {
            if (deriveLiveness(seat, unreachable).verdict === 'dead') { down = true; break; }
        }

        return { liveCount: live, totalCount: seats.length, freshCount: fresh, sealedCount: sealed, cageDown: down };
    }, [sessions, workers, unreachable]);

    const dotColor = unreachable ? GREY : liveCount > 0 ? GREEN : GREY;
    const statusLabel = unreachable
        ? 'roster unreachable'
        : totalCount === 0
            ? 'no seats yet'
            : `${liveCount} of ${totalCount} live`;

    const onChipPress = React.useCallback(() => {
        if (d.density === 'desktop') {
            // Desktop → clear selection so Column B falls to the RosterLedger.
            selection.clear();
        } else {
            // Deck/phone → inline-expand the ledger under the header.
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setInlineOpen((v) => !v);
        }
    }, [d.density, selection]);

    return (
        <View style={styles.headerBlock}>
            <View style={styles.headerTitleRow}>
                <Text style={[styles.headerTitle, { fontSize: scaled(22, d.typeScale) }]}>Cockpit</Text>
                <Pressable style={styles.headerStatusChip} onPress={onChipPress} hitSlop={6} accessibilityRole="button">
                    <StatusDot color={dotColor} isPulsing={!unreachable && freshCount > 0} size={7} />
                    <Text style={[styles.headerStatusText, { fontSize: scaled(12, d.typeScale) }]}>{statusLabel}</Text>
                    <Ionicons name="chevron-down" size={12} color={GREY} />
                </Pressable>
                {/* GRAFT 2 cage chip — absent entirely at zero sealed. */}
                {sealedCount > 0 ? (
                    <View style={styles.cageChip}>
                        <Ionicons name="lock-closed" size={11} color={cageDown ? RED : ACCENT_CAGE} />
                        <Text style={[styles.cageChipText, { color: cageDown ? RED : ACCENT_CAGE, fontSize: scaled(11.5, d.typeScale) }]}>
                            {cageDown ? 'cage: down' : `${sealedCount} sealed`}
                        </Text>
                    </View>
                ) : null}
            </View>
            <Text style={[styles.headerSubtitle, { fontSize: scaled(12.5, d.typeScale) }]}>Carlos's unified command surface</Text>
            {/* Deck/phone inline ledger drill-in (desktop uses Column B instead). */}
            {inlineOpen && d.density !== 'desktop' ? (
                <View style={styles.inlineLedger}>
                    <RosterLedger inline />
                </View>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create((theme) => ({
    headerBlock: {
        flex: 1,
        minWidth: 0,
    },
    headerTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
    },
    headerTitle: {
        fontSize: 22,
        color: theme.colors.text,
        letterSpacing: -0.3,
        ...Typography.default('semiBold'),
    },
    headerStatusChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 20,
        backgroundColor: theme.colors.groupped.background,
    },
    headerStatusText: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        ...Typography.default('semiBold'),
    },
    cageChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 20,
        backgroundColor: theme.colors.groupped.background,
    },
    cageChipText: {
        fontSize: 11.5,
        ...Typography.default('semiBold'),
    },
    headerSubtitle: {
        fontSize: 12.5,
        color: theme.colors.textSecondary,
        marginTop: 2,
        ...Typography.default(),
    },
    inlineLedger: {
        marginTop: 10,
    },
}));
