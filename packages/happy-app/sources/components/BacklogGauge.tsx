import * as React from 'react';
import { View } from 'react-native';
import { Text } from '@/components/StyledText';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { layout } from './layout';
import { useBacklog } from '@/hooks/useBacklog';
import { FeedUnreachable } from '@/components/HonestSignal';
import { BacklogSeat } from '@/sync/backlogTypes';

// BacklogGauge — Hearth MONITOR pillar (the backlog-depth gauge). Reads infra's backlog
// feed via GET /v1/backlog and is BORING WHEN HEALTHY: an empty backlog collapses to
// one quiet all-clear line; a non-empty backlog surfaces the per-seat counts, ordered
// oldest-first (the seat that's waited longest leads). Extends the disk/context gauges'
// grammar — level (count) + the honest-AGE signal (oldestAgeSec), not a rate/ETA: a
// backlog's urgency is "how long has the oldest item waited," never a faked trend.
//
// Honesty-spine (#0 invariant):
//   - the WHOLE feed unreachable/too-old -> FeedUnreachable (shared cross-pillar signal),
//     never a lying "0 backlog" when the feed itself is dark.
//   - a seat with items but no readable age -> oldestAgeSec null, rendered as a plain
//     count with no age line (honest-null, never a fake "0s ago").
//
// READ-ONLY. loom owns the FEEL + placement + final visual; strings plain pending her
// i18n pass.

const GREEN = '#34C759';
const AMBER = '#FF9500';
const RED = '#E5484D';

// Age bands mirror the disk/context gauges' urgency coloring — LOUD only when a queued
// item has genuinely sat a long while, never a false alarm on a fresh backlog.
const AMBER_AGE_SEC = 5 * 60;    // 5min waiting = worth a look
const RED_AGE_SEC = 30 * 60;     // 30min waiting = needs attention now

function ageColor(ageSec: number | null): string {
    if (ageSec == null) return GREEN;
    if (ageSec >= RED_AGE_SEC) return RED;
    if (ageSec >= AMBER_AGE_SEC) return AMBER;
    return GREEN;
}

// "~4min waiting" — honest-null when the feed can't read an age for this seat's backlog
// (present but unreadable, distinct from "nothing waiting").
function ageLabel(ageSec: number | null): string | null {
    if (ageSec == null) return null;
    if (ageSec < 60) return `${Math.round(ageSec)}s waiting`;
    const min = ageSec / 60;
    const mins = min < 10 ? min.toFixed(1) : String(Math.round(min));
    return `~${mins}min waiting`;
}

export function BacklogGauge() {
    const { theme } = useUnistyles();
    const { view, unreachable } = useBacklog();

    if (unreachable) {
        return (
            <View style={styles.container}>
                {/* Same reserved-height discipline as VramGauge/DiskGauge/ContextGauge
                    (PR-20/21) — the live<->unreachable swap is a same-height card. */}
                <FeedUnreachable message="can’t read the backlog right now" minHeight={72} />
            </View>
        );
    }
    if (!view) {
        return null; // no data yet / not present — quiet, never a fake zero
    }

    // Oldest-first (the seat that's waited longest leads), then by count.
    const seats = [...view.perSeat]
        .filter((s) => s.count > 0)
        .sort((a, b) => (b.oldestAgeSec ?? 0) - (a.oldestAgeSec ?? 0) || b.count - a.count);

    return (
        <View style={styles.container}>
            <View style={styles.headerRow}>
                <Text style={styles.title} numberOfLines={1}>BACKLOG</Text>
                {view.total > 0 ? (
                    <Text style={styles.headerNums}>{view.total} queued</Text>
                ) : null}
            </View>

            {seats.map((s) => {
                const color = ageColor(s.oldestAgeSec);
                const age = ageLabel(s.oldestAgeSec);
                return (
                    <View key={s.seat} style={styles.seatRow}>
                        <View style={styles.seatHeader}>
                            <Text style={styles.seatName} numberOfLines={1}>{s.seat}</Text>
                            <Text style={[styles.seatCount, { color }]}>{s.count}</Text>
                        </View>
                        {age ? (
                            <Text style={[styles.age, { color }]} numberOfLines={1}>{age}</Text>
                        ) : null}
                    </View>
                );
            })}

            {/* Boring-when-healthy: an empty backlog is one quiet line, never a wall of
                zero-count rows. */}
            {view.total === 0 ? (
                <Text style={styles.calm} numberOfLines={1}>backlog clear</Text>
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
        // Reserved card height (PR-21 discipline) — per-seat row count and the calm-line
        // swap must never reflow the list below.
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
    seatCount: {
        fontSize: 12,
        ...Typography.default('semiBold'),
    },
    age: {
        fontSize: 11,
        marginTop: 2,
        ...Typography.default(),
    },
    calm: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        marginTop: 2,
        ...Typography.default(),
    },
}));
