import * as React from 'react';
import { View } from 'react-native';
import { Text } from '@/components/StyledText';
import { StyleSheet } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { StatusDot } from '@/components/StatusDot';
import { useCongressRoster } from '@/hooks/useCongressRoster';
import { deriveLiveness } from '@/sync/liveness';
import { GREEN, GREY } from '../colors';
import { useDensity, scaled } from '../density';

// ============================================================================
// HEADER — considered identity for the unified command surface. Title +
// live-seat-count + a status dot, no cheesy branding. The dot/count are
// derived from the SAME roster feed + deriveLiveness verdict every lane tile
// already uses (never a second, independent "is it healthy" computation) —
// unreachable reads GREY-unverified (matches deriveLiveness's own
// fail-closed default for an unreachable poll), a reachable roster with zero
// live seats reads GREY-idle, and at least one 'alive' seat reads GREEN.
// Boring-when-healthy, honest-null when the roster hasn't answered yet.
// ============================================================================

export function CockpitHeader() {
    const d = useDensity();
    const { sessions, workers, unreachable } = useCongressRoster();

    const { liveCount, totalCount, freshCount } = React.useMemo(() => {
        const seats = [...sessions.values(), ...workers];
        let live = 0;
        let fresh = 0;
        for (const seat of seats) {
            const { verdict } = deriveLiveness(seat, unreachable);
            // "live" = identity-proven PRESENT (alive / idle / wedged) — the same
            // tier boundary the tiles paint as non-dead. Turn-freshness ('alive')
            // drives the pulse, NOT the count: a quiet seat is idle, not gone.
            // (CKP-03 — counting `online` keyed the headline to the 3-min turn
            // fence, so the count drained 9→0 as seats went quiet while their
            // tiles stayed lit. One derivation, two facets: presence + freshness.)
            if (verdict === 'alive' || verdict === 'idle' || verdict === 'wedged') live += 1;
            if (verdict === 'alive') fresh += 1;
        }
        return { liveCount: live, totalCount: seats.length, freshCount: fresh };
    }, [sessions, workers, unreachable]);

    const dotColor = unreachable ? GREY : liveCount > 0 ? GREEN : GREY;
    const statusLabel = unreachable
        ? 'roster unreachable'
        : totalCount === 0
            ? 'no seats yet'
            : `${liveCount} of ${totalCount} live`;

    return (
        <View style={styles.headerBlock}>
            <View style={styles.headerTitleRow}>
                <Text style={[styles.headerTitle, { fontSize: scaled(22, d.typeScale) }]}>Cockpit</Text>
                <View style={styles.headerStatusChip}>
                    <StatusDot color={dotColor} isPulsing={!unreachable && freshCount > 0} size={7} />
                    <Text style={[styles.headerStatusText, { fontSize: scaled(12, d.typeScale) }]}>{statusLabel}</Text>
                </View>
            </View>
            <Text style={[styles.headerSubtitle, { fontSize: scaled(12.5, d.typeScale) }]}>Carlos's unified command surface</Text>
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
    headerSubtitle: {
        fontSize: 12.5,
        color: theme.colors.textSecondary,
        marginTop: 2,
        ...Typography.default(),
    },
}));
