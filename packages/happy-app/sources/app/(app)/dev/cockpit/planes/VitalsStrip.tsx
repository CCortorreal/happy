import * as React from 'react';
import { View, Pressable, LayoutAnimation } from 'react-native';
import { Text } from '@/components/StyledText';
import { StyleSheet } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { StatusDot } from '@/components/StatusDot';
import { useVram } from '@/hooks/useVram';
import { useDisk } from '@/hooks/useDisk';
import { useHeartbeat } from '@/hooks/useHeartbeat';
import { useBacklog } from '@/hooks/useBacklog';
import { VramGauge } from '@/components/VramGauge';
import { DiskGauge } from '@/components/DiskGauge';
import { ContextGauge } from '@/components/ContextGauge';
import { BacklogGauge } from '@/components/BacklogGauge';
import { GREEN, AMBER, RED, GREY } from '../colors';
import { useDensity, scaled } from '../density';

// ============================================================================
// PLANE 3 — VITALS (ambient telemetry). Vram/Disk/Context/Heartbeat/Backlog
// collapse into ONE compact dot-row + one-line summary each. Boring-when-healthy;
// tap a dot to expand to the full gauge. A dead feed reads LOUD (red dot), never
// a calm lie — the strip inherits useHonestFeed's three-state discipline directly
// (each dot is unreachable ? red : derived-from-data, never a default green).
// ============================================================================

type VitalKey = 'vram' | 'disk' | 'context' | 'backlog';

// G17/G18 folded in: a blanket "unreachable -> red" collapses two different honest
// states into one alarm color. `hasData` distinguishes them:
//   - unreachable && hasData   -> DEAD.       This feed had a good read and lost it.
//   - unreachable && !hasData  -> BINDING.     No successful read has landed YET (first
//     paint / a fresh boot's poll hasn't settled) — genuinely unknown, not confidently
//     dead, so it must not paint the same alarm red as a confirmed-dead feed. It must
//     ALSO never paint a calm green (that would be the exact G10 lie this floor exists
//     to close) — GREY (the same "can't verify yet" tone `deriveLiveness` uses) is the
//     honest middle state.
//   - !unreachable && warning  -> RECOVERING/DEGRADED (amber) — reachable, values read,
//     but something in the data itself needs a look.
//   - !unreachable && !warning -> healthy green, backed by an actual fresh read.
function vitalDotColor(unreachable: boolean, hasWarning: boolean, hasData: boolean): string {
    if (unreachable) return hasData ? RED : GREY;
    if (hasWarning) return AMBER;
    return GREEN;
}

export function VitalsStrip() {
    const dens = useDensity();
    const vram = useVram();
    const disk = useDisk();
    const heartbeat = useHeartbeat();
    const backlog = useBacklog();
    const [expandedKey, setExpandedKey] = React.useState<VitalKey | null>(null);

    const vramWarn = !!vram.view && vram.view.totalMB > 0 && (vram.view.usedMB / vram.view.totalMB) >= 0.75;
    const diskWarn = !!disk.view && disk.view.boxes.some((b) => !b.reachable || b.drives.some((d) => d.status === 'warn' || d.status === 'act'));
    const contextWarn = !!heartbeat.view && (heartbeat.view.anyOverdue || heartbeat.view.seats.some((s) => s.inDangerZone || s.gateState === 'FIRE' || s.gateState === 'unreadable'));
    const backlogWarn = !!backlog.view && backlog.view.total > 0 && backlog.view.perSeat.some((s) => (s.oldestAgeSec ?? 0) >= 300);

    // G17/G18: "binding" (no successful read yet — first paint, or a boot still in
    // progress) reads as an honest "reading..." rather than silently sharing text with
    // either the healthy '—' or the confirmed-dead "can't read X" copy.
    const vramSummary = vram.unreachable
        ? (vram.view ? "can't read the GPU" : 'reading…')
        : vram.view
            ? `${Math.round((vram.view.usedMB / Math.max(1, vram.view.totalMB)) * 100)}% used`
            : '—';
    const diskSummary = disk.unreachable
        ? (disk.view ? "can't read disk" : 'reading…')
        : disk.view
            ? (diskWarn ? `${disk.view.boxes.filter((b) => !b.reachable).length + disk.view.boxes.reduce((n, b) => n + b.drives.filter((d) => d.status !== 'green').length, 0)} to watch` : 'all disks healthy')
            : '—';
    const contextSummary = heartbeat.unreachable
        ? (heartbeat.view ? "can't read heartbeat" : 'reading…')
        : heartbeat.view
            ? (heartbeat.view.anyOverdue ? 'overdue' : contextWarn ? 'seat near gate' : 'all seats calm')
            : '—';
    const backlogSummary = backlog.unreachable
        ? (backlog.view ? "can't read backlog" : 'reading…')
        : backlog.view
            ? (backlog.view.total > 0 ? `${backlog.view.total} queued` : 'backlog clear')
            : '—';

    const dots: { key: VitalKey; label: string; color: string; summary: string }[] = [
        { key: 'vram', label: 'VRAM', color: vitalDotColor(vram.unreachable, vramWarn, !!vram.view), summary: vramSummary },
        { key: 'disk', label: 'DISK', color: vitalDotColor(disk.unreachable, diskWarn, !!disk.view), summary: diskSummary },
        { key: 'context', label: 'CTX', color: vitalDotColor(heartbeat.unreachable, contextWarn, !!heartbeat.view), summary: contextSummary },
        { key: 'backlog', label: 'BKLG', color: vitalDotColor(backlog.unreachable, backlogWarn, !!backlog.view), summary: backlogSummary },
    ];

    return (
        <View style={styles.plane}>
            <Text style={[styles.planeTitle, { fontSize: scaled(13, dens.typeScale) }]}>VITALS</Text>
            <View style={[styles.vitalsRow, { gap: dens.cardGap }]}>
                {dots.map((d) => (
                    <Pressable
                        key={d.key}
                        style={[
                            styles.vitalDotWrap,
                            {
                                gap: Math.max(4, Math.round(dens.cardGap * 0.6)),
                                paddingHorizontal: dens.cardPaddingH,
                                paddingVertical: dens.cardPaddingV,
                                minWidth: scaled(140, dens.typeScale),
                            },
                        ]}
                        onPress={() => {
                            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                            setExpandedKey((k) => (k === d.key ? null : d.key));
                        }}
                    >
                        <StatusDot color={d.color} size={8} />
                        <Text style={[styles.vitalLabel, { fontSize: scaled(11, dens.typeScale) }]}>{d.label}</Text>
                        <Text style={[styles.vitalSummary, { fontSize: scaled(11, dens.typeScale) }]} numberOfLines={1}>{d.summary}</Text>
                    </Pressable>
                ))}
            </View>

            {expandedKey === 'vram' ? <VramGauge /> : null}
            {expandedKey === 'disk' ? <DiskGauge /> : null}
            {expandedKey === 'context' ? <ContextGauge /> : null}
            {expandedKey === 'backlog' ? <BacklogGauge /> : null}
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

    // --- VITALS strip ---
    vitalsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    vitalDotWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: theme.colors.surface,
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 8,
        minWidth: 140,
        // Reserved height (spec's lean invariant): the summary swap never resizes the row.
        minHeight: 36,
    },
    vitalLabel: {
        fontSize: 11,
        color: theme.colors.text,
        letterSpacing: 0.3,
        ...Typography.default('semiBold'),
    },
    vitalSummary: {
        flex: 1,
        fontSize: 11,
        color: theme.colors.textSecondary,
        ...Typography.default(),
    },
}));
