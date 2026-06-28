import * as React from 'react';
import { View } from 'react-native';
import { Text } from '@/components/StyledText';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { StatusDot } from './StatusDot';
import { CongressSeat } from '@/sync/congressTypes';
import { t } from '@/text';

// WorkerCard — Hearth worker-lane (a pull-worker brain on the cheap tier).
//
// A worker is WATCHED, not talked to — it has no cuid, so this card is NOT
// pressable-to-chat (the load-bearing UX difference from a session card). One
// face per agent, but a *worker* face (a chip glyph, not a session avatar).
//
//   title    = seat (brain-3090)
//   subtitle = model · currentWork   (idle -> model · idle; wedged -> stuck on X (Nm))
//   right    = verdict dot + warm/vram (warm · 4.2 GB | unloaded), greyed when cold/dead
//
// honest-death: a wedged worker greys its work line ("stuck on X (4m)"); a dead
// worker (verdict not ALIVE) greys the whole card — a dead watchdog must look dead.

function vramLabel(vramMB: number | null): string | null {
    if (vramMB == null) return null;
    if (vramMB >= 1024) return `${(vramMB / 1024).toFixed(1)} GB`;
    return `${vramMB} MB`;
}

// Minutes since an ISO/epoch startedAt, or null if unparseable.
function minutesSince(startedAt: string | null): number | null {
    if (!startedAt) return null;
    const started = typeof startedAt === 'string' ? Date.parse(startedAt) : Number(startedAt);
    if (!Number.isFinite(started)) return null;
    const mins = Math.floor((Date.now() - started) / 60000);
    return mins >= 0 ? mins : null;
}

export function WorkerCard({ worker }: { worker: CongressSeat }) {
    const { theme } = useUnistyles();
    const alive = worker.verdict.trim().toUpperCase() === 'ALIVE';
    const wedged = (worker.workStatus ?? '').toLowerCase() === 'stuck'
        || (worker.workStatus ?? '').toLowerCase() === 'wedged';

    const model = worker.model ?? worker.role ?? worker.seat;

    // The work line: stuck (wedged) reads as honest-death; else currentWork; else idle.
    let workLine: string;
    if (wedged) {
        const mins = minutesSince(worker.startedAt);
        workLine = t('worker.stuck', { task: worker.currentWork ?? worker.seat, mins: mins ?? 0 });
    } else if (worker.currentWork) {
        workLine = worker.currentWork;
    } else {
        workLine = t('worker.idle');
    }

    const vram = vramLabel(worker.vramMB);
    const rightText = worker.warm
        ? (vram ? `${t('worker.warm')} · ${vram}` : t('worker.warm'))
        : t('worker.unloaded');

    const dimmed = !alive;
    const dotColor = !alive ? '#999' : (worker.warm ? '#34C759' : '#999');

    return (
        <View style={[styles.card, dimmed && styles.cardDimmed]}>
            <View style={styles.glyph}>
                <Ionicons
                    name="hardware-chip-outline"
                    size={22}
                    color={alive ? theme.colors.text : theme.colors.textSecondary}
                />
            </View>
            <View style={styles.center}>
                <Text style={styles.title} numberOfLines={1}>{worker.seat}</Text>
                <Text
                    style={[styles.subtitle, (wedged || !alive) && styles.subtitleMuted]}
                    numberOfLines={2}
                >
                    {`${model} · ${workLine}`}
                </Text>
            </View>
            <View style={styles.right}>
                <StatusDot color={dotColor} isPulsing={false} />
                <Text style={styles.rightText} numberOfLines={1}>{rightText}</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create((theme) => ({
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.surface,
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 14,
        marginHorizontal: 16,
        marginBottom: 8,
    },
    cardDimmed: {
        opacity: 0.55,
    },
    glyph: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.groupped.background,
        marginRight: 12,
    },
    center: {
        flex: 1,
        justifyContent: 'center',
    },
    title: {
        fontSize: 15,
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
    subtitle: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        marginTop: 2,
        ...Typography.default(),
    },
    subtitleMuted: {
        fontStyle: 'italic',
    },
    right: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        marginLeft: 8,
    },
    rightText: {
        fontSize: 11,
        color: theme.colors.textSecondary,
        ...Typography.default(),
    },
}));
