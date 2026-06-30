import * as React from 'react';
import { View } from 'react-native';
import { Text } from '@/components/StyledText';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { layout } from './layout';
import { useHeartbeat } from '@/hooks/useHeartbeat';
import { FeedUnreachable } from '@/components/HonestSignal';
import { HeartbeatSeat } from '@/sync/heartbeatTypes';

// ContextGauge — Hearth MONITOR pillar (the box-citizen's vital sign, cut 3). Reads
// ai-ops's heartbeat feed via GET /v1/heartbeat and shows which congress seats are
// filling toward their 750K auto-compact gate. BORING WHEN HEALTHY: surfaces only seats
// that need a look (in the danger zone, overdue, mid-FIRE, or unreadable) and collapses
// the calm ones into one quiet line. Extends the level+rate+ETA grammar: level=pctToGate,
// rate=burnPerTurn, ETA=etaMinToFire — honest-null when uncertain (just-booted / just-
// compacted / no-turn-advance), never a fake countdown.
//
// Honesty-spine (#0 invariant):
//   - the WHOLE feed unreachable/too-old -> FeedUnreachable. Freshness IS liveness here:
//     a stale heartbeat feed IS the daemon-dead signal (daemonAlive is always true inside
//     the file), so a dead feed reads loud, never a fake-calm "all seats fine".
//   - a single seat we can't read (gateState 'unreadable') -> greyed row, not absent.
//   - `overdue` (recovery exhausted) is the load-bearing danger -> loud red.
//
// READ-ONLY. loom owns the FEEL + placement + final visual; strings plain pending her pass.

const GREEN = '#34C759';
const AMBER = '#FF9500';
const RED = '#E5484D';

function shouldSurface(s: HeartbeatSeat): boolean {
    return s.overdue || s.inDangerZone || s.gateState === 'FIRE' || s.gateState === 'unreadable';
}

function seatColor(s: HeartbeatSeat, theme: ReturnType<typeof useUnistyles>['theme']): string {
    if (s.gateState === 'unreadable') return theme.colors.textSecondary;
    if (s.overdue || s.gateState === 'FIRE') return RED;
    if (s.inDangerZone) return AMBER;
    return GREEN;
}

// "4431/turn · ~2.1min to compact" — level+rate+ETA, honest-null on each part.
function rateEta(s: HeartbeatSeat): string | null {
    const bits: string[] = [];
    if (s.burnPerTurn != null) {
        bits.push(`${Math.round(s.burnPerTurn)}/turn`);
    }
    if (s.etaMinToFire != null) {
        const m = s.etaMinToFire < 10 ? s.etaMinToFire.toFixed(1) : String(Math.round(s.etaMinToFire));
        bits.push(`~${m}min to compact`);
    }
    return bits.length ? bits.join(' · ') : null;
}

// The plain status under a hot seat — the WHY, never a bare number.
function statusNote(s: HeartbeatSeat): string | null {
    if (s.overdue) return 'overdue — recovery exhausted';
    if (s.gateState === 'FIRE') return 'compacting now';
    if (s.gateState === 'unreadable') return 'can’t read context';
    if (s.locked) return 'locked — won’t fire mid-turn';
    if (s.gateState === 'cooldown') return 'cooling down';
    return null;
}

export function ContextGauge() {
    const { theme } = useUnistyles();
    const { view, unreachable } = useHeartbeat();

    if (unreachable) {
        // Feed dead = something upstream stopped writing (the daemon OR ai-ops's heartbeat
        // organ — we can't tell which from here, so don't assert a cause). Loud, never a fake calm.
        return (
            <View style={styles.container}>
                {/* PR-20: minHeight = container's reserved floor (96) minus its own
                    vertical padding (12+12) — the live<->unreachable swap is a same-
                    height card, never a jump. */}
                <FeedUnreachable message="can’t read the heartbeat right now" minHeight={72} />
            </View>
        );
    }
    if (!view) {
        return null;
    }

    const surfaced = view.seats.filter(shouldSurface);
    // overdue first, then hottest by pctToGate.
    surfaced.sort((a, b) => {
        if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
        return (b.pctToGate ?? 0) - (a.pctToGate ?? 0);
    });
    const calmCount = view.seats.length - surfaced.length;

    return (
        <View style={styles.container}>
            <View style={styles.headerRow}>
                <Text style={styles.title} numberOfLines={1}>CONTEXT</Text>
                {view.anyOverdue ? (
                    <Text style={[styles.headerNums, { color: RED }]}>overdue</Text>
                ) : surfaced.length > 0 ? (
                    <Text style={styles.headerNums}>{surfaced.length} near gate</Text>
                ) : null}
            </View>

            {surfaced.map((s) => {
                const color = seatColor(s, theme);
                const pct = s.pctToGate != null ? Math.round(s.pctToGate * 100) : null;
                const note = statusNote(s);
                const trend = rateEta(s);
                const isUnreadable = s.gateState === 'unreadable';
                return (
                    <View key={s.seat} style={styles.seatRow}>
                        <View style={styles.seatHeader}>
                            <Text style={styles.seatName} numberOfLines={1}>{s.seat}</Text>
                            {pct != null && !isUnreadable ? (
                                <Text style={[styles.seatPct, { color }]}>{pct}%</Text>
                            ) : null}
                        </View>
                        {pct != null && !isUnreadable ? (
                            <View style={styles.barTrack}>
                                <View style={[styles.barFill, { width: `${Math.min(100, pct)}%`, backgroundColor: color }]} />
                            </View>
                        ) : null}
                        {trend && !isUnreadable ? (
                            <Text style={styles.trend} numberOfLines={1}>{trend}</Text>
                        ) : null}
                        {note ? (
                            <Text style={[styles.note, (s.overdue || s.gateState === 'FIRE') && { color: RED }]} numberOfLines={1}>
                                {note}
                            </Text>
                        ) : null}
                    </View>
                );
            })}

            {/* Boring-when-healthy: the calm seats are one quiet line, never a wall of bars. */}
            {calmCount > 0 ? (
                <Text style={styles.calm} numberOfLines={1}>
                    {surfaced.length === 0
                        ? (calmCount === 1 ? '1 seat calm' : `all ${calmCount} seats calm`)
                        : `+ ${calmCount} seat${calmCount === 1 ? '' : 's'} calm`}
                </Text>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create((theme) => ({
    container: {
        width: '100%',
        maxWidth: layout.maxWidth,
        alignSelf: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        // Reserved card height (PR-21) — surfaced-seat count and the calm-line swap
        // must never reflow the list below. Sized to the common shape (header + one
        // surfaced seat row); a calmer/busier card just adds quiet whitespace or
        // grows past the floor, never collapses thinner.
        minHeight: 96,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
    },
    title: {
        flex: 1,
        fontSize: 13,
        color: theme.colors.text,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        ...Typography.default('semiBold'),
    },
    headerNums: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        ...Typography.default(),
    },
    seatRow: {
        marginBottom: 10,
    },
    seatHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 4,
    },
    seatName: {
        flex: 1,
        fontSize: 13,
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
    seatPct: {
        fontSize: 12,
        ...Typography.default('semiBold'),
    },
    barTrack: {
        height: 8,
        borderRadius: 4,
        backgroundColor: theme.colors.groupped.background,
        overflow: 'hidden',
    },
    barFill: {
        height: 8,
        borderRadius: 4,
    },
    trend: {
        fontSize: 11,
        color: theme.colors.textSecondary,
        marginTop: 3,
        ...Typography.default(),
    },
    note: {
        fontSize: 11,
        color: theme.colors.textSecondary,
        marginTop: 3,
        fontStyle: 'italic',
        ...Typography.default(),
    },
    calm: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        marginTop: 2,
        ...Typography.default(),
    },
}));
