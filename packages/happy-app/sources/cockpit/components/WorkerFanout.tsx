import * as React from 'react';
import { View } from 'react-native';
import { Text } from '@/components/StyledText';
import { StyleSheet } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { Avatar } from '@/components/Avatar';
import { StatusDot } from '@/components/StatusDot';
import { CongressSeat } from '@/sync/congressTypes';
import { deriveLiveness } from '@/sync/liveness';
import { GREEN, AMBER, RED, GREY, isDimmed } from '../colors';
import { useDensity, scaled } from '../density';

export const WORKER_AVATAR_SHOWN = 8;

// One worker avatar — mirrors FloorTile's roster button: face + a small status
// dot, honest per-worker state via the SAME deriveLiveness the lane dot uses
// (never a separate hard-coded green for workers).
export function WorkerAvatar({ worker, rosterUnreachable }: { worker: CongressSeat; rosterUnreachable: boolean }) {
    const d = useDensity();
    const { verdict } = deriveLiveness(worker, rosterUnreachable);
    const color = verdict === 'alive' ? GREEN : verdict === 'wedged' ? AMBER : verdict === 'dead' ? RED : GREY;
    const label = worker.currentWork?.trim() || worker.model?.trim() || worker.role?.trim() || worker.seat;
    // CKP-12 monochrome policy — a worker keeps its identity color unless it's
    // confidently gone (dead) or unverifiable. The old `verdict !== 'alive'`
    // drained idle/wedged workers to grey too, erasing identity from a lane
    // that's merely quiet. Sealed workers get a square face (sovereignty ch. 2).
    const sealed = worker.cage_status === 'sealed';
    return (
        <View style={[styles.workerAvatarWrap, { width: d.workerAvatarSize + 26 }]}>
            <Avatar id={worker.seat} size={d.workerAvatarSize} monochrome={isDimmed(verdict)} square={sealed} />
            <StatusDot color={color} isPulsing={verdict === 'alive'} size={7} style={styles.workerDot} />
            <Text style={[styles.workerLabel, { fontSize: scaled(9.5, d.typeScale) }]} numberOfLines={1}>{label}</Text>
        </View>
    );
}

// The worker roster strip under a god lane — up to WORKER_AVATAR_SHOWN shown,
// '+N more' beyond that (the munder FloorTile pattern). `inferred` marks a
// group whose linkage came from the host+pedal fallback signal (always true
// today — there is no stronger linkage field yet) so the UI never claims a
// hierarchy stronger than what was actually derived.
export function WorkerFanout({ workers, rosterUnreachable, inferred }: {
    workers: CongressSeat[];
    rosterUnreachable: boolean;
    inferred: boolean;
}) {
    const d = useDensity();
    if (workers.length === 0) return null;
    const shown = workers.slice(0, WORKER_AVATAR_SHOWN);
    const overflow = workers.length - shown.length;
    return (
        <View style={styles.workerFanout}>
            <View style={styles.workerFanoutHeaderRow}>
                <Text style={[styles.workerFanoutTitle, { fontSize: scaled(11, d.typeScale) }]}>
                    workers · {workers.length}
                </Text>
                {inferred ? (
                    <Text style={[styles.workerFanoutInferred, { fontSize: scaled(10, d.typeScale) }]}>grouped by host+pedal — inferred, not a proven link</Text>
                ) : null}
            </View>
            <View style={[styles.workerRoster, { gap: d.cardGap }]}>
                {shown.map((w, i) => (
                    <WorkerAvatar key={`${w.seat}-${i}`} worker={w} rosterUnreachable={rosterUnreachable} />
                ))}
                {overflow > 0 ? <Text style={[styles.workerMore, { fontSize: scaled(12, d.typeScale) }]}>+{overflow} more</Text> : null}
            </View>
        </View>
    );
}

const styles = StyleSheet.create((theme) => ({
    // --- GOD -> WORKER fan-out (munder FloorTile pattern: god + worker roster) ---
    workerFanout: {
        marginTop: 10,
        paddingTop: 10,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: theme.colors.divider,
    },
    workerFanoutHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 6,
    },
    workerFanoutTitle: {
        fontSize: 11,
        color: theme.colors.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 0.4,
        ...Typography.default('semiBold'),
    },
    workerFanoutInferred: {
        flex: 1,
        fontSize: 10,
        color: theme.colors.textSecondary,
        fontStyle: 'italic',
        ...Typography.default(),
    },
    workerRoster: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 8,
    },
    workerAvatarWrap: {
        alignItems: 'center',
        width: 52,
    },
    workerDot: {
        marginTop: -8,
        marginLeft: 18,
    },
    workerLabel: {
        fontSize: 9.5,
        color: theme.colors.textSecondary,
        textAlign: 'center',
        marginTop: 2,
        ...Typography.default(),
    },
    workerMore: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        alignSelf: 'center',
        ...Typography.default('semiBold'),
    },
}));
