import * as React from 'react';
import { View, Pressable, Animated, Easing, LayoutAnimation, Platform, ViewStyle } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/StyledText';
import { Avatar } from '@/components/Avatar';
import { StatusDot } from '@/components/StatusDot';
import { Typography } from '@/constants/Typography';
import {
    HearthLane, HearthGate, HearthVital, HearthThread, HearthResume, HearthPulse,
    EMBER, EMBER_BRIGHT, EMBER_TINT, GREEN, AMBER, RED, GREY, ACCENT_GATE, ACCENT_ROUTINE,
    laneDotColor, lanePulses, contextPctColor, isDimmed,
} from './hearthModel';

// ============================================================================
// HEARTH components — the honest, calm card grammar. Every card wears a 3px
// left-spine whose colour IS the honest state (the signature). Reuses the REAL
// Avatar / StatusDot and the REAL cockpit colours + isDimmed. Dev-slice: strings
// are literals (i18n-exempt), demo-fed. See hearthModel.ts + docs/hearth-successor.md.
// ============================================================================

function easeNext() {
    if (Platform.OS !== 'web') {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
}

// ---- the spine-card primitive -------------------------------------------------
interface SpineCardProps {
    color: string;
    children: React.ReactNode;
    onPress?: () => void;
    onLongPress?: () => void;
    dead?: boolean;
    tinted?: string;               // optional wash behind the card (continuity ember)
    style?: ViewStyle;
}

function SpineCard({ color, children, onPress, onLongPress, dead, tinted, style }: SpineCardProps) {
    const body = (
        <>
            <View style={[styles.spine, { backgroundColor: color }]} />
            <View style={styles.cardInner}>{children}</View>
        </>
    );
    const base: ViewStyle[] = [styles.card];
    if (tinted) base.push({ backgroundColor: tinted });
    if (dead) base.push(styles.cardDead);
    if (style) base.push(style);
    if (onPress || onLongPress) {
        return (
            <Pressable
                onPress={onPress}
                onLongPress={onLongPress}
                style={({ pressed }) => (pressed ? [...base, styles.cardPressed] : base)}
            >
                {body}
            </Pressable>
        );
    }
    return <View style={base}>{body}</View>;
}

// ---- section header ----------------------------------------------------------
export function SectionHeader({ title, count }: { title: string; count?: string }) {
    return (
        <View style={styles.sec}>
            <Text style={styles.secTitle}>{title}</Text>
            {count ? <Text style={styles.secCount}>{count}</Text> : null}
        </View>
    );
}

// ---- fleet pulse line --------------------------------------------------------
export function FleetPulseLine({ pulse }: { pulse: HearthPulse }) {
    return (
        <View style={styles.pulse}>
            <StatusDot color={EMBER} isPulsing={pulse.fresh} size={7} />
            <Text style={styles.pulseText}>
                <Text style={styles.pulseStrong}>{pulse.lanes}</Text> lanes
                <Text style={styles.pulseSep}>  ·  </Text>
                <Text style={styles.pulseStrong}>{pulse.needYou}</Text> need you
                <Text style={styles.pulseSep}>  ·  </Text>
                <Text style={styles.pulseStrong}>{pulse.hot}</Text> hot
                <Text style={styles.pulseSep}>  ·  </Text>
                cap <Text style={styles.pulseStrong}>{pulse.capPct}%</Text>
            </Text>
        </View>
    );
}

// ---- resume (continuity) card ------------------------------------------------
export function ResumeCard({ resume, onJump, onThreads }: { resume: HearthResume; onJump: () => void; onThreads: () => void }) {
    return (
        <View style={styles.wrap}>
            <SpineCard color={EMBER} tinted={EMBER_TINT} onPress={onJump}>
                <Text style={styles.resumeLbl}>YOU WERE</Text>
                <Text style={styles.resumeLine}>{resume.pedalLine}</Text>
                <View style={styles.resumeRow}>
                    <Pressable onPress={onThreads} hitSlop={8}>
                        <Text style={styles.resumeThreads}>{resume.threadsOpen} open threads</Text>
                    </Pressable>
                    <Text style={styles.resumeSub}>  ·  last touch {resume.lastTouch}</Text>
                    <View style={styles.flex} />
                    <View style={styles.jump}>
                        <Text style={styles.jumpText}>Jump</Text>
                        <Ionicons name="arrow-forward" size={14} color="#1a0f05" />
                    </View>
                </View>
            </SpineCard>
        </View>
    );
}

// ---- needs-you (knock) card --------------------------------------------------
export function NeedsYouCard({ gate, onApprove, onDeny }: { gate: HearthGate; onApprove: () => void; onDeny: () => void }) {
    const spine = gate.kind === 'gate' ? ACCENT_GATE : ACCENT_ROUTINE;
    const dot = gate.kind === 'gate' ? RED : ACCENT_ROUTINE;
    return (
        <View style={styles.wrap}>
            <SpineCard color={spine} onPress={onApprove}>
                <View style={styles.gateTop}>
                    <Avatar id={`seat-${gate.seat}`} size={22} square flavor={null} />
                    <Text style={styles.gateSeat}>{gate.seat}</Text>
                    <Text style={styles.gateMachine}>· {gate.machine}</Text>
                    <View style={styles.flex} />
                    <StatusDot color={dot} size={8} />
                </View>
                <Text style={styles.gateAsk}>{gate.ask}</Text>
                {gate.command ? <Text style={styles.gateCmd}>{gate.command}</Text> : null}
                {gate.blocksDownstream ? (
                    <View style={styles.blocks}>
                        <Ionicons name="ban" size={13} color={gate.kind === 'gate' ? RED : AMBER} />
                        <Text style={[styles.blocksText, { color: gate.kind === 'gate' ? RED : AMBER }]}>
                            blocks {gate.blocksDownstream} downstream
                        </Text>
                    </View>
                ) : null}
                <View style={styles.actions}>
                    <Pressable style={[styles.act, styles.actApprove]} onPress={onApprove}>
                        <Ionicons name="checkmark" size={16} color="#5fd58c" />
                        <Text style={styles.actApproveText}>{gate.kind === 'gate' ? 'Approve' : 'Proceed'}</Text>
                    </Pressable>
                    <Pressable style={[styles.act, styles.actDeny]} onPress={onDeny}>
                        <Ionicons name="close" size={16} color="#ff7a7e" />
                        <Text style={styles.actDenyText}>{gate.kind === 'gate' ? 'Deny' : 'Hold'}</Text>
                    </Pressable>
                </View>
            </SpineCard>
        </View>
    );
}

// ---- live-session lane card --------------------------------------------------
export function LaneCard({ lane, onPress }: { lane: HearthLane; onPress: () => void }) {
    const dot = laneDotColor(lane.verdict, lane.blockedDownstream);
    const dimmed = isDimmed(lane.verdict);
    const showPct = lane.contextPct > 0;
    return (
        <View style={styles.wrap}>
            <SpineCard color={dot} onPress={onPress} dead={lane.verdict === 'dead'}>
                <View style={styles.lane}>
                    <Avatar id={`seat-${lane.name}`} size={40} monochrome={dimmed} flavor={lane.flavor ?? null} />
                    <View style={styles.laneBody}>
                        <View style={styles.laneRow1}>
                            <StatusDot color={dot} isPulsing={lanePulses(lane)} size={9} />
                            <Text style={[styles.laneName, dimmed && styles.dimText]}>{lane.name}</Text>
                            <Text style={styles.laneMachine}>· {lane.machine}</Text>
                        </View>
                        <Text style={styles.laneThought} numberOfLines={1}>{lane.thought}</Text>
                    </View>
                    <View style={styles.laneMeta}>
                        {showPct ? (
                            <Text style={[styles.lanePct, { color: contextPctColor(lane.contextPct) }]}>{lane.contextPct}%</Text>
                        ) : (
                            <Text style={styles.laneIdle}>{lane.verdict === 'idle' ? 'idle' : '—'}</Text>
                        )}
                        {lane.cost ? <Text style={styles.laneCost}>{lane.cost}</Text> : null}
                    </View>
                </View>
                {lane.workers && lane.workers.length > 0 ? (
                    <View style={styles.fanout}>
                        <Ionicons name="git-branch-outline" size={11} color={GREY} />
                        <Text style={styles.fanoutText}>{lane.workers.length} workers · {lane.workers.join(' · ')}</Text>
                    </View>
                ) : null}
            </SpineCard>
        </View>
    );
}

// ---- fold ("N quiet lanes") --------------------------------------------------
export function FoldChip({ count, open, onToggle }: { count: number; open: boolean; onToggle: () => void }) {
    return (
        <Pressable
            style={styles.fold}
            onPress={() => { easeNext(); onToggle(); }}
        >
            <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={16} color={GREY} />
            <Text style={styles.foldText}>{count} quiet lanes</Text>
        </Pressable>
    );
}

// ---- vitals block (chips -> expand a bar in place) ---------------------------
export function VitalsBlock({ vitals }: { vitals: HearthVital[] }) {
    const [open, setOpen] = React.useState<string | null>(null);
    const toggle = (k: string) => { easeNext(); setOpen(open === k ? null : k); };
    const active = vitals.find(v => v.key === open) ?? null;
    return (
        <View style={styles.vitals}>
            <View style={styles.vrow}>
                {vitals.map(v => {
                    const color = v.redline ? RED : v.warn ? AMBER : GREEN;
                    return (
                        <Pressable key={v.key} style={styles.vchip} onPress={() => toggle(v.key)}>
                            <Text style={styles.vk}>{v.key}</Text>
                            <Text style={[styles.vv, { color }]}>{v.value}</Text>
                            <View style={styles.vbarTrack}>
                                <View style={[styles.vbarFill, { width: `${Math.round((v.pct ?? 0) * 100)}%`, backgroundColor: color }]} />
                            </View>
                        </Pressable>
                    );
                })}
            </View>
            {active ? (
                <View style={styles.vexpand}>
                    <View style={styles.vexpandHead}>
                        <Text style={styles.vexpandKey}>{active.key}</Text>
                        <Text style={styles.vexpandDetail}>{active.detail}</Text>
                    </View>
                    <View style={styles.vexpandBarTrack}>
                        <View style={[styles.vexpandBarFill, {
                            width: `${Math.round((active.pct ?? 0) * 100)}%`,
                            backgroundColor: active.redline ? RED : active.warn ? AMBER : GREEN,
                        }]} />
                    </View>
                </View>
            ) : null}
        </View>
    );
}

// ---- digest line -------------------------------------------------------------
export function DigestLine({ text, onPress }: { text: string; onPress: () => void }) {
    return (
        <Pressable style={styles.digest} onPress={onPress}>
            <Text style={styles.digestLbl}>RELAY</Text>
            <Text style={styles.digestText} numberOfLines={1}>{text}</Text>
            <Ionicons name="arrow-forward" size={14} color={GREY} />
        </Pressable>
    );
}

// ---- threads (continuity) view ----------------------------------------------
function ThreadRow({ thread, onPress }: { thread: HearthThread; onPress: () => void }) {
    const spine = thread.pedal ? EMBER : laneDotColor(thread.verdict);
    return (
        <View style={styles.wrap}>
            <SpineCard color={spine} tinted={thread.pedal ? EMBER_TINT : undefined} onPress={onPress}>
                {thread.pedal ? <Text style={styles.pedalLbl}>PEDAL THREAD</Text> : null}
                <Text style={[styles.threadTitle, thread.stale && styles.dimText]}>{thread.title}</Text>
                <View style={styles.threadMeta}>
                    <Avatar id={`seat-${thread.seat}`} size={18} square flavor={null} monochrome={thread.stale} />
                    <Text style={styles.threadSeat}>
                        {thread.seat}{thread.machine ? ` · ${thread.machine}` : ''}
                    </Text>
                    <View style={styles.flex} />
                    <Text style={styles.threadAge}>{thread.age}</Text>
                </View>
            </SpineCard>
        </View>
    );
}

export function ThreadsView({ threads, onOpen }: { threads: HearthThread[]; onOpen: (t: HearthThread) => void }) {
    const domains = ['Infra', 'Atlas', 'Methodology', 'Finance'];
    const pedal = threads.find(t => t.pedal);
    return (
        <View>
            {pedal ? <ThreadRow thread={pedal} onPress={() => onOpen(pedal)} /> : null}
            {domains.map(d => {
                const rows = threads.filter(t => t.domain === d && !t.pedal);
                if (rows.length === 0) return null;
                return (
                    <View key={d}>
                        <SectionHeader title={d} />
                        {rows.map(t => <ThreadRow key={t.id} thread={t} onPress={() => onOpen(t)} />)}
                    </View>
                );
            })}
        </View>
    );
}

// ---- permission sheet (arm -> confirm, one grammar) --------------------------
interface PermissionSheetProps {
    gate: HearthGate | null;
    onResolve: (label: string) => void;
    onClose: () => void;
}

export function PermissionSheet({ gate, onResolve, onClose }: PermissionSheetProps) {
    const { theme } = useUnistyles();
    const visible = gate != null;
    const slide = React.useRef(new Animated.Value(0)).current;
    const [armed, setArmed] = React.useState(false);
    const [count, setCount] = React.useState(3);
    const timer = React.useRef<ReturnType<typeof setInterval> | null>(null);

    React.useEffect(() => {
        Animated.timing(slide, {
            toValue: visible ? 1 : 0,
            duration: 280,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();
        if (!visible) {
            setArmed(false);
            if (timer.current) clearInterval(timer.current);
        }
    }, [visible, slide]);

    React.useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

    const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [520, 0] });
    const scrimOpacity = slide.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

    const arm = () => {
        if (!gate) return;
        if (!gate.destructive) { onResolve('Approved once'); return; }
        if (armed) {
            if (timer.current) clearInterval(timer.current);
            setArmed(false);
            onResolve('Approved once');
            return;
        }
        setArmed(true);
        setCount(3);
        if (timer.current) clearInterval(timer.current);
        timer.current = setInterval(() => {
            setCount(c => {
                if (c <= 1) {
                    if (timer.current) clearInterval(timer.current);
                    setArmed(false);
                    return 3;
                }
                return c - 1;
            });
        }, 1000);
    };

    return (
        <View style={StyleSheet.absoluteFill} pointerEvents={visible ? 'auto' : 'none'}>
            <Animated.View style={[styles.scrim, { opacity: scrimOpacity }]}>
                <Pressable style={styles.flex} onPress={onClose} />
            </Animated.View>
            <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
                <View style={styles.grab} />
                {gate ? (
                    <>
                        <View style={styles.sheetWho}>
                            <Avatar id={`seat-${gate.seat}`} size={26} square flavor={null} />
                            <View>
                                <Text style={styles.sheetSeat}>{gate.seat}</Text>
                                <Text style={styles.sheetRole}>{gate.machine}</Text>
                            </View>
                            <View style={styles.flex} />
                            <StatusDot color={gate.destructive ? RED : ACCENT_ROUTINE} size={9} />
                        </View>
                        <Text style={styles.sheetTitle}>
                            {gate.destructive ? `${gate.seat} wants to run a destructive command` : gate.ask}
                        </Text>
                        {gate.command ? <Text style={styles.sheetCmd}>{gate.command}</Text> : null}
                        {gate.blocksDownstream ? (
                            <View style={styles.cascade}>
                                <Ionicons name="ban" size={13} color={AMBER} />
                                <Text style={styles.cascadeText}>approving unblocks {gate.blocksDownstream} downstream tasks</Text>
                            </View>
                        ) : null}
                        <View style={styles.bars}>
                            <Pressable style={[styles.bar, styles.barGreen, armed && styles.barArmed]} onPress={arm}>
                                <Ionicons name="checkmark" size={18} color="#7ee0a0" />
                                <View style={styles.flex}>
                                    <Text style={styles.barGreenText}>{armed ? `Confirm — approve · ${count}` : 'Approve once'}</Text>
                                    <Text style={styles.barCaption}>runs this one command</Text>
                                </View>
                            </Pressable>
                            <Pressable style={[styles.bar, styles.barNeutral]} onPress={() => onResolve(gate.modeChange ? 'Approved — session (mode changed)' : 'Approved — session')}>
                                <View style={styles.flex}>
                                    <Text style={styles.barNeutralText}>Approve — all {gate.destructive ? 'commands' : 'runs'} this session</Text>
                                    {gate.modeChange ? <Text style={styles.barWarn}>⚠ {gate.modeChange}</Text> : <Text style={styles.barCaption}>stays in the current mode</Text>}
                                </View>
                            </Pressable>
                            <Pressable style={[styles.bar, styles.barRed]} onPress={() => onResolve('Denied')}>
                                <Ionicons name="close" size={18} color="#ff7a7e" />
                                <Text style={styles.barRedText}>{gate.destructive ? 'Deny — tell it why' : 'Not now'}</Text>
                            </Pressable>
                        </View>
                        <Text style={styles.sheetHint}>the same sheet renders from a lock-screen notification — approve without unlocking</Text>
                    </>
                ) : null}
            </Animated.View>
        </View>
    );
}

// ============================================================================
// styles (unistyles, function-form for theme access) — at the very end.
// ============================================================================
const styles = StyleSheet.create((theme) => ({
    wrap: { paddingHorizontal: theme.margins.lg },
    flex: { flex: 1 },
    dimText: { color: theme.colors.textSecondary },

    // card grammar
    card: {
        position: 'relative',
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.xl,
        overflow: 'hidden',
        marginBottom: theme.margins.sm + 2,
    },
    cardPressed: { backgroundColor: theme.colors.surfaceHigh },
    cardDead: { borderWidth: 1, borderColor: 'rgba(229,72,77,0.55)' },
    spine: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
    cardInner: { paddingVertical: 14, paddingRight: 15, paddingLeft: 17 },

    // section header
    sec: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: theme.margins.lg + 4, paddingTop: theme.margins.lg, paddingBottom: theme.margins.sm },
    secTitle: { fontSize: 11.5, letterSpacing: 1.6, textTransform: 'uppercase', color: theme.colors.textSecondary, ...Typography.mono('semiBold') },
    secCount: { fontSize: 11.5, color: theme.colors.textSecondary, ...Typography.mono() },

    // pulse
    pulse: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: theme.margins.lg + 4, paddingBottom: theme.margins.md },
    pulseText: { fontSize: 12.5, color: theme.colors.textSecondary, ...Typography.mono() },
    pulseStrong: { color: theme.colors.text, ...Typography.mono('semiBold') },
    pulseSep: { color: theme.colors.textSecondary, opacity: 0.6 },

    // resume
    resumeLbl: { fontSize: 10.5, letterSpacing: 1.8, color: EMBER, marginBottom: 6, ...Typography.mono('semiBold') },
    resumeLine: { fontSize: 16.5, color: theme.colors.text, lineHeight: 22, ...Typography.default('semiBold') },
    resumeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 9 },
    resumeThreads: { fontSize: 11.5, color: theme.colors.text, ...Typography.mono(), textDecorationLine: 'underline' },
    resumeSub: { fontSize: 11.5, color: theme.colors.textSecondary, ...Typography.mono() },
    jump: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: EMBER, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
    jumpText: { fontSize: 13, color: '#1a0f05', ...Typography.default('semiBold') },

    // needs-you
    gateTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    gateSeat: { fontSize: 14, color: theme.colors.text, ...Typography.default('semiBold') },
    gateMachine: { fontSize: 11, color: theme.colors.textSecondary, ...Typography.mono() },
    gateAsk: { fontSize: 15, color: theme.colors.text, lineHeight: 20, ...Typography.default('semiBold') },
    gateCmd: { fontSize: 12.5, color: EMBER_BRIGHT, backgroundColor: '#1A1A1F', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 6, marginTop: 8, ...Typography.mono() },
    blocks: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 9 },
    blocksText: { fontSize: 11.5, ...Typography.mono() },
    actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
    act: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 11, borderRadius: theme.borderRadius.md },
    actApprove: { backgroundColor: 'rgba(46,158,91,0.16)', borderWidth: 1, borderColor: 'rgba(46,158,91,0.32)' },
    actApproveText: { fontSize: 13.5, color: '#5fd58c', ...Typography.default('semiBold') },
    actDeny: { backgroundColor: 'rgba(229,72,77,0.13)', borderWidth: 1, borderColor: 'rgba(229,72,77,0.3)' },
    actDenyText: { fontSize: 13.5, color: '#ff7a7e', ...Typography.default('semiBold') },

    // lane
    lane: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    laneBody: { flex: 1, minWidth: 0 },
    laneRow1: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    laneName: { fontSize: 15, color: theme.colors.text, ...Typography.default('semiBold') },
    laneMachine: { fontSize: 11, color: theme.colors.textSecondary, ...Typography.mono() },
    laneThought: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 2, ...Typography.default() },
    laneMeta: { alignItems: 'flex-end', gap: 3 },
    lanePct: { fontSize: 12, ...Typography.mono('semiBold') },
    laneIdle: { fontSize: 12, color: theme.colors.textSecondary, ...Typography.mono() },
    laneCost: { fontSize: 10.5, color: theme.colors.textSecondary, ...Typography.mono() },
    fanout: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, paddingLeft: 52 },
    fanoutText: { fontSize: 10.5, color: theme.colors.textSecondary, ...Typography.mono() },

    // fold
    fold: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: theme.margins.lg, marginBottom: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: theme.borderRadius.xl, backgroundColor: theme.colors.surface },
    foldText: { fontSize: 13, color: theme.colors.textSecondary, ...Typography.default('semiBold') },

    // vitals
    vitals: { marginHorizontal: theme.margins.lg, marginTop: 6, backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.xl, overflow: 'hidden' },
    vrow: { flexDirection: 'row', gap: 6, padding: 12 },
    vchip: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 8, borderRadius: 9 },
    vk: { fontSize: 10, letterSpacing: 1, color: theme.colors.textSecondary, ...Typography.mono() },
    vv: { fontSize: 13, ...Typography.mono('semiBold') },
    vbarTrack: { width: '100%', height: 4, borderRadius: 2, backgroundColor: theme.colors.surfaceHighest, overflow: 'hidden' },
    vbarFill: { height: '100%', borderRadius: 2 },
    vexpand: { paddingHorizontal: 14, paddingBottom: 14, borderTopWidth: 1, borderTopColor: theme.colors.divider },
    vexpandHead: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 12, marginBottom: 8 },
    vexpandKey: { fontSize: 11, letterSpacing: 1, color: theme.colors.text, ...Typography.mono('semiBold') },
    vexpandDetail: { fontSize: 11, color: theme.colors.textSecondary, ...Typography.mono() },
    vexpandBarTrack: { width: '100%', height: 6, borderRadius: 3, backgroundColor: theme.colors.surfaceHighest, overflow: 'hidden' },
    vexpandBarFill: { height: '100%', borderRadius: 3 },

    // digest
    digest: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: theme.margins.lg, marginTop: 8, paddingHorizontal: 14, paddingVertical: 11, borderRadius: theme.borderRadius.xl, backgroundColor: theme.colors.surface },
    digestLbl: { fontSize: 10, letterSpacing: 1.2, color: theme.colors.textSecondary, ...Typography.mono() },
    digestText: { flex: 1, fontSize: 12.5, color: theme.colors.textSecondary, ...Typography.default() },

    // threads
    pedalLbl: { fontSize: 10.5, letterSpacing: 1.6, color: EMBER, marginBottom: 5, ...Typography.mono('semiBold') },
    threadTitle: { fontSize: 14.5, color: theme.colors.text, lineHeight: 20, ...Typography.default('semiBold') },
    threadMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 7 },
    threadSeat: { fontSize: 11, color: theme.colors.textSecondary, ...Typography.mono() },
    threadAge: { fontSize: 11, color: theme.colors.textSecondary, ...Typography.mono() },

    // permission sheet
    scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
    sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: theme.colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 18, paddingTop: 8, paddingBottom: 24 },
    grab: { width: 38, height: 4, borderRadius: 2, backgroundColor: theme.colors.surfaceHighest, alignSelf: 'center', marginBottom: 14 },
    sheetWho: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
    sheetSeat: { fontSize: 16, color: theme.colors.text, ...Typography.default('semiBold') },
    sheetRole: { fontSize: 11, color: theme.colors.textSecondary, ...Typography.mono() },
    sheetTitle: { fontSize: 17, color: theme.colors.text, lineHeight: 22, ...Typography.default('semiBold') },
    sheetCmd: { fontSize: 13, color: '#ff9a6a', backgroundColor: '#1A1A1F', borderWidth: 1, borderColor: 'rgba(229,72,77,0.28)', paddingHorizontal: 14, paddingVertical: 13, borderRadius: 10, marginTop: 12, ...Typography.mono() },
    cascade: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12 },
    cascadeText: { fontSize: 12, color: AMBER, ...Typography.mono() },
    bars: { gap: 9, marginTop: 14 },
    bar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 12 },
    barArmed: { borderWidth: 2, borderColor: RED },
    barGreen: { backgroundColor: 'rgba(46,158,91,0.18)', borderWidth: 1, borderColor: 'rgba(46,158,91,0.4)' },
    barGreenText: { fontSize: 15, color: '#7ee0a0', ...Typography.default('semiBold') },
    barNeutral: { backgroundColor: theme.colors.surfaceHighest },
    barNeutralText: { fontSize: 15, color: theme.colors.text, ...Typography.default('semiBold') },
    barWarn: { fontSize: 11, color: AMBER, marginTop: 2, ...Typography.mono() },
    barCaption: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 2, ...Typography.mono() },
    barRed: { backgroundColor: 'rgba(229,72,77,0.15)', borderWidth: 1, borderColor: 'rgba(229,72,77,0.4)' },
    barRedText: { fontSize: 15, color: '#ff7a7e', ...Typography.default('semiBold') },
    sheetHint: { fontSize: 10.5, color: theme.colors.textSecondary, textAlign: 'center', marginTop: 14, ...Typography.mono() },
}));
