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
import { VitalGaugeCard, VitalGaugeStatus } from '../components/VitalGaugeCard';

// ============================================================================
// PLANE 3 — VITALS (ambient telemetry). Vram/Disk/Context/Heartbeat/Backlog
// collapse into ONE compact dot-row + one-line summary each. Boring-when-healthy;
// tap a dot to expand to the full gauge. A dead feed reads LOUD (red dot), never
// a calm lie — the strip inherits useHonestFeed's three-state discipline directly
// (each dot is unreachable ? red : derived-from-data, never a default green).
//
// CKP-15: `variant='gauges'` (desktop/deck right rail) swaps the dot-row for
// glanceable VitalGaugeCards (label + big value + bar + sparkline). `variant='dots'`
// (default = phone) keeps today's row byte-for-byte. Both share the SAME four feeds,
// warn predicates, and tap-to-expand full gauges.
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

// The gauge-card honest status (CKP-04/15). Derived from the feed's honest signals:
//   - unreachable (whether or not last-known data survives) -> 'dead'    (loud).
//   - reachable + a fresh read                              -> 'live'.
//   - reachable + no data yet                               -> 'binding' (calm 'reading…').
//
// CKP-04 FIX: `unreachable` is NOT a first-paint state — useHonestFeed only trips it
// after >=3 consecutive failed/timed-out polls (~12s), so by the time it's true the feed
// is CONFIRMED failing, never "still settling." Mapping unreachable-with-no-data to
// 'binding' ("reading…") was the perpetual-"reading…" lie: DISK/CTX, whose sentinel
// writers died days ago, read as "still loading" forever. Now unreachable => 'dead'
// ("unavailable — can't read X", or a dimmed last-known + "last read {age} ago" when the
// hook kept the stale view). 'binding' is reserved for the genuinely-settling window:
// reachable, first polls in flight, no data landed yet.
function deriveGaugeStatus(
    unreachable: boolean,
    hasData: boolean,
    feedStatus?: 'binding' | 'live' | 'dead',
): VitalGaugeStatus {
    if (unreachable) return 'dead';
    if (hasData) return 'live';
    if (feedStatus === 'dead') return 'dead';
    return 'binding';
}

// Dot color from the gauge status + warn predicate — keeps the card's dot honest and in
// lockstep with the status branch (red when dead, grey when binding, warn-color when live).
function gaugeDotColor(status: VitalGaugeStatus, hasWarning: boolean, atRedLine: boolean): string {
    if (status === 'dead') return RED;
    if (status === 'binding') return GREY;
    if (atRedLine) return RED;
    if (hasWarning) return AMBER;
    return GREEN;
}

// Bar fill color from the warn predicates (per spec): warn -> AMBER, >=90% (vram/ctx) ->
// RED, else GREEN. A color only ever paints in the LIVE branch (the card enforces that).
function barColorFor(hasWarning: boolean, atRedLine: boolean): string {
    if (atRedLine) return RED;
    if (hasWarning) return AMBER;
    return GREEN;
}

export interface VitalsStripProps {
    variant?: 'dots' | 'gauges';
}

export function VitalsStrip({ variant = 'dots' }: VitalsStripProps) {
    const dens = useDensity();
    const vram = useVram();
    const disk = useDisk();
    const heartbeat = useHeartbeat();
    const backlog = useBacklog();
    const [expandedKey, setExpandedKey] = React.useState<VitalKey | null>(null);

    // Track the last epoch-ms each feed was reachable-with-data, so a DEAD card can show
    // 'last read {age} ago' honestly (the feed hooks don't carry a read timestamp).
    const lastReadAt = React.useRef<Record<VitalKey, number | null>>({
        vram: null, disk: null, context: null, backlog: null,
    });
    if (!vram.unreachable && vram.view) lastReadAt.current.vram = Date.now();
    if (!disk.unreachable && disk.view) lastReadAt.current.disk = Date.now();
    if (!heartbeat.unreachable && heartbeat.view) lastReadAt.current.context = Date.now();
    if (!backlog.unreachable && backlog.view) lastReadAt.current.backlog = Date.now();

    const vramWarn = !!vram.view && vram.view.totalMB > 0 && (vram.view.usedMB / vram.view.totalMB) >= 0.75;
    const diskWarn = !!disk.view && disk.view.boxes.some((b) => !b.reachable || b.drives.some((d) => d.status === 'warn' || d.status === 'act'));
    const contextWarn = !!heartbeat.view && (heartbeat.view.anyOverdue || heartbeat.view.seats.some((s) => s.inDangerZone || s.gateState === 'FIRE' || s.gateState === 'unreadable'));
    const backlogWarn = !!backlog.view && backlog.view.total > 0 && backlog.view.perSeat.some((s) => (s.oldestAgeSec ?? 0) >= 300);

    // G17/G18: "binding" (no successful read yet — first paint, or a boot still in
    // progress) reads as an honest "reading..." rather than silently sharing text with
    // either the healthy '—' or the confirmed-dead "can't read X" copy.
    const vramSummary = vram.unreachable
        ? (vram.view ? "can't read the GPU" : 'unavailable')
        : vram.view
            ? `${Math.round((vram.view.usedMB / Math.max(1, vram.view.totalMB)) * 100)}% used`
            : '—';
    const diskSummary = disk.unreachable
        ? (disk.view ? "can't read disk" : 'unavailable')
        : disk.view
            ? (diskWarn ? `${disk.view.boxes.filter((b) => !b.reachable).length + disk.view.boxes.reduce((n, b) => n + b.drives.filter((d) => d.status !== 'green').length, 0)} to watch` : 'all disks healthy')
            : '—';
    const contextSummary = heartbeat.unreachable
        ? (heartbeat.view ? "can't read heartbeat" : 'unavailable')
        : heartbeat.view
            ? (heartbeat.view.anyOverdue ? 'overdue' : contextWarn ? 'seat near gate' : 'all seats calm')
            : '—';
    const backlogSummary = backlog.unreachable
        ? (backlog.view ? "can't read backlog" : 'unavailable')
        : backlog.view
            ? (backlog.view.total > 0 ? `${backlog.view.total} queued` : 'backlog clear')
            : '—';

    if (variant === 'gauges') {
        return (
            <View style={styles.plane}>
                <Text style={[styles.planeTitle, { fontSize: scaled(13, dens.typeScale) }]}>VITALS</Text>
                <View style={[styles.gaugeGrid, { gap: dens.cardGap }]}>
                    {gaugeCards({ vram, disk, heartbeat, backlog, vramWarn, diskWarn, contextWarn, backlogWarn, lastReadAt: lastReadAt.current, setExpandedKey })}
                </View>

                {expandedKey === 'vram' ? <VramGauge /> : null}
                {expandedKey === 'disk' ? <DiskGauge /> : null}
                {expandedKey === 'context' ? <ContextGauge /> : null}
                {expandedKey === 'backlog' ? <BacklogGauge /> : null}
            </View>
        );
    }

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

// Builds the four gauge cards (CKP-15). Kept a plain function (not a component) so the
// warn predicates / summaries computed above are reused verbatim — one source of truth
// for the honest state, shared with the dot-row.
function gaugeCards(args: {
    vram: ReturnType<typeof useVram>;
    disk: ReturnType<typeof useDisk>;
    heartbeat: ReturnType<typeof useHeartbeat>;
    backlog: ReturnType<typeof useBacklog>;
    vramWarn: boolean;
    diskWarn: boolean;
    contextWarn: boolean;
    backlogWarn: boolean;
    lastReadAt: Record<VitalKey, number | null>;
    setExpandedKey: React.Dispatch<React.SetStateAction<VitalKey | null>>;
}) {
    const { vram, disk, heartbeat, backlog, vramWarn, diskWarn, contextWarn, backlogWarn, lastReadAt, setExpandedKey } = args;

    // --- VRAM: used/total % ---
    const vramPct = vram.view && vram.view.totalMB > 0 ? vram.view.usedMB / vram.view.totalMB : null;
    const vramRed = vramPct != null && vramPct >= 0.9;
    const vramStatus = deriveGaugeStatus(vram.unreachable, !!vram.view);
    const vramValue = vramPct != null ? `${Math.round(vramPct * 100)}%` : '—';
    const vramDetail = vram.view
        ? `${(vram.view.usedMB / 1024).toFixed(1)}/${(vram.view.totalMB / 1024).toFixed(1)} GB`
        : '';

    // --- DISK: worst-drive % used ---
    const diskDrives = (disk.view?.boxes ?? []).flatMap((b) => b.drives);
    const worstDiskPct = diskDrives.reduce<number | null>((worst, d) => {
        if (d.pctUsed == null) return worst;
        const frac = d.pctUsed > 1 ? d.pctUsed / 100 : d.pctUsed; // tolerate 0..1 or 0..100
        return worst == null || frac > worst ? frac : worst;
    }, null);
    const toWatch = disk.view
        ? disk.view.boxes.filter((b) => !b.reachable).length + disk.view.boxes.reduce((n, b) => n + b.drives.filter((d) => d.status !== 'green' && d.status != null).length, 0)
        : 0;
    const diskRed = worstDiskPct != null && worstDiskPct >= 0.9;
    const diskStatus = deriveGaugeStatus(disk.unreachable, !!disk.view);
    const diskValue = worstDiskPct != null ? `${Math.round(worstDiskPct * 100)}%` : '—';
    const diskDetail = disk.view ? (toWatch > 0 ? `${toWatch} to watch` : 'all disks healthy') : '';

    // --- CTX: worst seat context-pressure % (same fields contextPressure reads) ---
    const ctxSeats = heartbeat.view?.seats ?? [];
    const worstCtxPct = ctxSeats.reduce<number | null>((worst, s) => {
        const p = s.pctToGate;
        if (p == null) return worst;
        return worst == null || p > worst ? p : worst;
    }, null);
    const ctxRed = worstCtxPct != null && worstCtxPct >= 0.9;
    const ctxStatus = deriveGaugeStatus(heartbeat.unreachable, !!heartbeat.view);
    const ctxValue = worstCtxPct != null ? `${Math.round(worstCtxPct * 100)}%` : '—';
    const ctxDetail = heartbeat.view
        ? (heartbeat.view.anyOverdue ? 'overdue' : contextWarn ? 'seat near gate' : 'all seats calm')
        : '';

    // --- BKLG: queued COUNT as the big number; bar normalized min(total/20, 1) ---
    const backlogTotal = backlog.view?.total ?? null;
    const backlogBar = backlogTotal != null ? Math.min(backlogTotal / 20, 1) : null;
    const backlogStatus = deriveGaugeStatus(backlog.unreachable, !!backlog.view, backlog.status);
    const backlogValue = backlogTotal != null ? `${backlogTotal}` : '—';
    const backlogDetail = backlog.view ? 'queued' : '';

    const cards: {
        key: VitalKey;
        label: string;
        status: VitalGaugeStatus;
        value: string;
        barPct: number | null;
        hasWarning: boolean;
        atRedLine: boolean;
        sparkValue: number | null;
        detail: string;
    }[] = [
        { key: 'vram', label: 'VRAM', status: vramStatus, value: vramValue, barPct: vramPct, hasWarning: vramWarn, atRedLine: vramRed, sparkValue: vramPct != null ? vramPct * 100 : null, detail: vramDetail },
        { key: 'disk', label: 'DISK', status: diskStatus, value: diskValue, barPct: worstDiskPct, hasWarning: diskWarn, atRedLine: diskRed, sparkValue: worstDiskPct != null ? worstDiskPct * 100 : null, detail: diskDetail },
        { key: 'context', label: 'CTX', status: ctxStatus, value: ctxValue, barPct: worstCtxPct, hasWarning: contextWarn, atRedLine: ctxRed, sparkValue: worstCtxPct != null ? worstCtxPct * 100 : null, detail: ctxDetail },
        { key: 'backlog', label: 'BKLG', status: backlogStatus, value: backlogValue, barPct: backlogBar, hasWarning: backlogWarn, atRedLine: false, sparkValue: backlogTotal, detail: backlogDetail },
    ];

    return cards.map((c) => (
        <Pressable
            key={c.key}
            style={styles.gaugeCardWrap}
            onPress={() => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setExpandedKey((k) => (k === c.key ? null : c.key));
            }}
        >
            <VitalGaugeCard
                vitalKey={c.key}
                label={c.label}
                status={c.status}
                value={c.value}
                barPct={c.barPct}
                barColor={barColorFor(c.hasWarning, c.atRedLine)}
                dotColor={gaugeDotColor(c.status, c.hasWarning, c.atRedLine)}
                sparkValue={c.sparkValue}
                detail={c.detail}
                lastReadAt={lastReadAt[c.key]}
            />
        </Pressable>
    ));
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

    // --- VITALS strip (dots variant) ---
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

    // --- VITALS gauges variant (CKP-15) ---
    gaugeGrid: {
        gap: 8,
    },
    gaugeCardWrap: {
        // Each card is fixed-height (64) internally; the wrap just carries the press.
        width: '100%',
    },
}));
