import * as React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/StyledText';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { layout } from './layout';
import { useDisk } from '@/hooks/useDisk';
import { FeedUnreachable } from '@/components/HonestSignal';
import { DiskDrive } from '@/sync/diskTypes';

// DiskGauge — Hearth MONITOR pillar (the disk-resilience HUD, cut 2). Reads the disk-
// sentinel feed via GET /v1/disk and is BORING WHEN HEALTHY: it surfaces only what
// needs a look (drives at warn/act, boxes the sentinel went blind to, standing-risk
// notes) and collapses everything green into one quiet line. Extends the VRAM gauge's
// grammar — a pctUsed bar painted by status, the level+rate+ETA trend (etaToActDays,
// the pattern the disk-sentinel pioneered) honest-null when a drive isn't filling.
//
// Honesty-spine (#0 invariant, two layers kept distinct):
//   - the WHOLE feed unreachable/too-old -> FeedUnreachable (shared cross-pillar signal);
//   - a single BOX the sentinel couldn't probe -> an honest "blind to this box" row
//     (amber attention, NOT the feed-dead red — the box isn't broken, we just can't see it).
//
// READ-ONLY. loom owns the FEEL + placement + the final visual; strings plain pending
// her i18n pass.

const GREEN = '#34C759';
const AMBER = '#FF9500';
const RED = '#E5484D';

function statusColor(status: string | null): string {
    if (status === 'act') return RED;
    if (status === 'warn') return AMBER;
    if (status === 'green') return GREEN;
    return AMBER; // unknown status reads as needs-a-look, never a false green
}

function isAtRisk(d: DiskDrive): boolean {
    return d.status === 'warn' || d.status === 'act';
}

// "~2.9d to full" — the time-to-impact, honest-null when the drive isn't filling
// (etaToActDays null, or a flat/draining trend). loom owns the exact wording.
function etaLabel(d: DiskDrive): string | null {
    if (d.etaToActDays == null || d.etaToActDays <= 0) return null;
    if (d.fillRateGBPerDay != null && d.fillRateGBPerDay <= 0) return null;
    const eta = d.etaToActDays < 10 ? d.etaToActDays.toFixed(1) : String(Math.round(d.etaToActDays));
    return `~${eta}d to full`;
}

export function DiskGauge() {
    const { theme } = useUnistyles();
    const { view, unreachable } = useDisk();

    if (unreachable) {
        return (
            <View style={styles.container}>
                <FeedUnreachable message="can’t read disk right now" />
            </View>
        );
    }
    if (!view) {
        return null; // no data yet / not present — quiet, never a fake zero
    }

    // Collect the concerns across all boxes — at-risk drives (tagged with their box),
    // and boxes the sentinel went blind to. Everything else collapses to a quiet count.
    const atRisk: { box: string; drive: DiskDrive }[] = [];
    const blindBoxes: { box: string; reason: string | null }[] = [];
    let healthyDrives = 0;
    for (const b of view.boxes) {
        if (!b.reachable) {
            blindBoxes.push({ box: b.box, reason: b.reason });
            continue;
        }
        for (const d of b.drives) {
            if (isAtRisk(d)) {
                atRisk.push({ box: b.box, drive: d });
            } else {
                healthyDrives += 1;
            }
        }
    }
    // act before warn (most urgent first), then unknown.
    atRisk.sort((a, b) => (b.drive.status === 'act' ? 1 : 0) - (a.drive.status === 'act' ? 1 : 0));

    const concernCount = atRisk.length + blindBoxes.length;

    return (
        <View style={styles.container}>
            <View style={styles.headerRow}>
                <Text style={styles.title} numberOfLines={1}>DISK</Text>
                {concernCount > 0 ? (
                    <Text style={styles.headerNums}>{concernCount} to watch</Text>
                ) : null}
            </View>

            {atRisk.map(({ box, drive }) => {
                const color = statusColor(drive.status);
                const pct = drive.pctUsed ?? 0;
                const eta = etaLabel(drive);
                return (
                    <View key={`${box}-${drive.id}`} style={styles.driveRow}>
                        <View style={styles.driveHeader}>
                            <Text style={styles.driveName} numberOfLines={1}>{box} {drive.id}</Text>
                            <Text style={[styles.drivePct, { color }]}>{Math.round(pct)}%</Text>
                        </View>
                        <View style={styles.barTrack}>
                            <View style={[styles.barFill, { width: `${Math.min(100, Math.round(pct))}%`, backgroundColor: color }]} />
                        </View>
                        {drive.role ? (
                            <Text style={styles.driveRole} numberOfLines={1}>{drive.role}</Text>
                        ) : null}
                        {eta ? (
                            <Text style={[styles.driveEta, { color: AMBER }]} numberOfLines={1}>{eta}</Text>
                        ) : null}
                        {drive.note ? (
                            <Text style={styles.driveNote} numberOfLines={2}>{drive.note}</Text>
                        ) : null}
                    </View>
                );
            })}

            {blindBoxes.map(({ box, reason }) => (
                <View key={`blind-${box}`} style={styles.blindBox}>
                    <View style={styles.blindHeader}>
                        <Ionicons name="warning-outline" size={11} color={AMBER} style={styles.blindIcon} />
                        <Text style={[styles.blindName, { color: AMBER }]} numberOfLines={1}>{box} · can’t reach</Text>
                    </View>
                    {reason ? (
                        <Text style={styles.blindReason} numberOfLines={2}>{reason}</Text>
                    ) : null}
                </View>
            ))}

            {/* Boring-when-healthy: the all-clear is one quiet line, never a wall of green bars. */}
            {healthyDrives > 0 ? (
                <Text style={styles.healthy} numberOfLines={1}>
                    {concernCount === 0
                        ? `all disks healthy · ${healthyDrives} drives`
                        : `+ ${healthyDrives} drives healthy`}
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
        // Reserved card height (PR-21) — at-risk/blind-box rows and the healthy-line
        // swap must never reflow the list below. Sized to the common shape (header +
        // the all-clear line); a busier card just grows past the floor.
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
    driveRow: {
        marginBottom: 10,
    },
    driveHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 4,
    },
    driveName: {
        flex: 1,
        fontSize: 13,
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
    drivePct: {
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
    driveRole: {
        fontSize: 11,
        color: theme.colors.textSecondary,
        marginTop: 4,
        ...Typography.default(),
    },
    driveEta: {
        fontSize: 11,
        marginTop: 3,
        ...Typography.default(),
    },
    driveNote: {
        fontSize: 11,
        color: theme.colors.textSecondary,
        lineHeight: 15,
        marginTop: 3,
        fontStyle: 'italic',
        ...Typography.default(),
    },
    blindBox: {
        marginBottom: 8,
    },
    blindHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    blindIcon: {
        width: 14,
        textAlign: 'center',
    },
    blindName: {
        flex: 1,
        fontSize: 12,
        ...Typography.default('semiBold'),
    },
    blindReason: {
        fontSize: 11,
        color: theme.colors.textSecondary,
        lineHeight: 15,
        marginTop: 3,
        marginLeft: 20,
        fontStyle: 'italic',
        ...Typography.default(),
    },
    healthy: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        marginTop: 2,
        ...Typography.default(),
    },
}));
