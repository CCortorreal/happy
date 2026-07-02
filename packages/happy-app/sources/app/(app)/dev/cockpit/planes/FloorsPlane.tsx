import * as React from 'react';
import { View, Pressable, LayoutAnimation } from 'react-native';
import { Text } from '@/components/StyledText';
import { StyleSheet } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { StatusDot } from '@/components/StatusDot';
import { FeedUnreachable } from '@/components/HonestSignal';
import { useCongressKanban } from '@/hooks/useCongressKanban';
import { CongressFloorBoard } from '@/sync/congressKanbanTypes';
import { KanbanChips } from '../components/KanbanChips';
import { GREY } from '../colors';
import { useDensity, scaled } from '../density';

// ============================================================================
// PLANE 5 — FLOORS (CKP-02, Carlos's "go big" call). The building's per-floor
// kanban boards, first-class: each floor's hive/tasks.json counts rendered as
// the same chips the lanes once faked. Honest-state throughout: an absent
// offices root (building down) is FeedUnreachable, a boardless-but-readable
// root is a quiet line, and every floor row carries its board's mtime age so
// a stale board can't masquerade as a live one. Phone collapses to
// tap-to-expand, mirroring RelayPlane's idiom.
// ============================================================================

// Compact relative age for a board mtime — glanceable staleness, not a clock.
function boardAgeLabel(tsMs: number): string {
    const ageSec = Math.max(0, Math.round((Date.now() - tsMs) / 1000));
    if (ageSec < 60) return `${ageSec}s`;
    if (ageSec < 3600) return `${Math.round(ageSec / 60)}m`;
    if (ageSec < 86400) return `${Math.round(ageSec / 3600)}h`;
    return `${Math.round(ageSec / 86400)}d`;
}

function FloorRow({ board, typeScale }: { board: CongressFloorBoard; typeScale: number }) {
    return (
        <View style={styles.floorRow}>
            <Text style={[styles.floorRowName, { fontSize: scaled(12.5, typeScale) }]} numberOfLines={1}>
                {board.floor}
            </Text>
            <KanbanChips counts={board} typeScale={typeScale} />
            <Text style={[styles.floorRowAge, { fontSize: scaled(10.5, typeScale) }]}>
                {board.total} task{board.total === 1 ? '' : 's'} · board {boardAgeLabel(board.ts)} old
            </Text>
        </View>
    );
}

export function FloorsPlane() {
    const d = useDensity();
    const { floors, unreachable } = useCongressKanban();
    const [phoneExpanded, setPhoneExpanded] = React.useState(false);

    // Honest empty: offices root readable but no floor has a board — the calm
    // all-clear line, same pattern as RelayPlane's quiet state.
    if (floors.length === 0 && !unreachable) {
        return (
            <View style={[styles.plane, { marginBottom: d.planeGap }]}>
                <Text style={[styles.planeTitle, { fontSize: scaled(13, d.typeScale) }]}>FLOORS</Text>
                <View style={styles.quietLineRow}>
                    <StatusDot color={GREY} size={6} />
                    <Text style={[styles.quietLine, { fontSize: scaled(13, d.typeScale) }]}>No floor boards</Text>
                </View>
            </View>
        );
    }

    if (floors.length === 0 && unreachable) {
        return (
            <View style={[styles.plane, { marginBottom: d.planeGap }]}>
                <Text style={[styles.planeTitle, { fontSize: scaled(13, d.typeScale) }]}>FLOORS</Text>
                <View style={[styles.unreachableCard, { borderRadius: d.cardRadius, paddingVertical: d.cardPaddingV, paddingHorizontal: d.cardPaddingH }]}>
                    <FeedUnreachable message="can't reach the floor boards" />
                </View>
            </View>
        );
    }

    if (d.density === 'phone' && !phoneExpanded) {
        return (
            <View style={[styles.plane, { marginBottom: d.planeGap }]}>
                <Pressable onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setPhoneExpanded(true); }}>
                    <Text style={[styles.planeTitle, { fontSize: scaled(13, d.typeScale) }]}>FLOORS · {floors.length} · tap to expand</Text>
                </Pressable>
            </View>
        );
    }

    return (
        <View style={[styles.plane, { marginBottom: d.planeGap }]}>
            <Pressable disabled={d.density !== 'phone'} onPress={() => setPhoneExpanded(false)}>
                <Text style={[styles.planeTitle, { fontSize: scaled(13, d.typeScale) }]}>FLOORS · {floors.length}</Text>
            </Pressable>
            {floors.map((board) => <FloorRow key={board.floor} board={board} typeScale={d.typeScale} />)}
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

    // --- FLOORS plane (CKP-02) ---
    floorRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 4,
    },
    floorRowName: {
        minWidth: 72,
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
    floorRowAge: {
        marginLeft: 'auto',
        color: theme.colors.textSecondary,
        ...Typography.mono(),
    },
}));
