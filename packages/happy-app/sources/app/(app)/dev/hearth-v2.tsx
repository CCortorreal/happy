import * as React from 'react';
import { View, ScrollView, Pressable, Animated } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/StyledText';
import { FAB } from '@/components/FAB';
import { Typography } from '@/constants/Typography';
import { layout } from '@/components/layout';
import {
    demoHearth, HearthGate, HearthThread, EMBER, GREY,
} from '@/hearth/hearthModel';
import {
    FleetPulseLine, ResumeCard, NeedsYouCard, LaneCard, FoldChip,
    VitalsBlock, DigestLine, SectionHeader, ThreadsView, PermissionSheet,
} from '@/hearth/HearthComponents';

// ============================================================================
// dev/hearth-v2 — a runnable vertical slice of the Hearth successor (desk,
// Carlos-directed 2026-07-03). Phone posture: the single urgency-ordered stream
// (Resume -> Needs-You -> The Work -> Vitals -> Relay) + the gesture Permission
// Sheet + the Continuity/Threads view. Demo-fed via demoHearth(); the honest-
// state colours + isDimmed come from the REAL cockpit modules. i18n-exempt (dev).
// Steal-list for the unifying-surface lane — see docs/hearth-successor.md.
// ============================================================================

function useToast() {
    const opacity = React.useRef(new Animated.Value(0)).current;
    const [msg, setMsg] = React.useState<{ k: string; t: string } | null>(null);
    const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const show = React.useCallback((k: string, t: string) => {
        setMsg({ k, t });
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
            Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => setMsg(null));
        }, 2400);
    }, [opacity]);
    React.useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
    return { opacity, msg, show };
}

function HearthV2Screen() {
    const { theme } = useUnistyles();
    const model = React.useMemo(() => demoHearth(), []);
    const [gates, setGates] = React.useState<HearthGate[]>(model.gates);
    const [permGate, setPermGate] = React.useState<HearthGate | null>(null);
    const [foldOpen, setFoldOpen] = React.useState(false);
    const [view, setView] = React.useState<'stream' | 'threads'>('stream');
    const toast = useToast();

    const resolveGate = React.useCallback((id: string, label: string, seat: string) => {
        setGates(g => g.filter(x => x.id !== id));
        setPermGate(null);
        toast.show(`${seat} · ${label}`, id === 'g1' ? 'fork retired · 2 downstream unblocked' : '');
    }, [toast]);

    const onCardApprove = (gate: HearthGate) => {
        if (gate.kind === 'gate') setPermGate(gate);
        else resolveGate(gate.id, 'proceeding', gate.seat);
    };
    const onCardDeny = (gate: HearthGate) => {
        resolveGate(gate.id, gate.kind === 'gate' ? 'denied' : 'held', gate.seat);
    };

    return (
        <View style={styles.root}>
            <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
                <View style={styles.brandRow}>
                    <Text style={styles.brand}>he<Text style={styles.brandEm}>a</Text>rth</Text>
                    {view === 'threads' ? (
                        <Pressable style={styles.crumb} onPress={() => setView('stream')} hitSlop={8}>
                            <Ionicons name="chevron-back" size={16} color={GREY} />
                            <Text style={styles.crumbText}>Home</Text>
                        </Pressable>
                    ) : (
                        <Text style={styles.tag}>successor · slice</Text>
                    )}
                </View>

                {view === 'stream' ? (
                    <>
                        <FleetPulseLine pulse={model.pulse} />

                        <ResumeCard
                            resume={model.resume}
                            onJump={() => toast.show('Resuming', model.resume.pedalLine)}
                            onThreads={() => setView('threads')}
                        />

                        {gates.length > 0 ? (
                            <>
                                <SectionHeader title="Needs you" count={`· ${gates.length}`} />
                                {gates.map(g => (
                                    <NeedsYouCard
                                        key={g.id}
                                        gate={g}
                                        onApprove={() => onCardApprove(g)}
                                        onDeny={() => onCardDeny(g)}
                                    />
                                ))}
                            </>
                        ) : (
                            <View style={styles.calm}>
                                <Text style={styles.calmText}>Nothing needs you — the congress is quiet.</Text>
                            </View>
                        )}

                        <SectionHeader title="The work" count={`· ${model.pulse.lanes}`} />
                        {model.lanes.map(l => (
                            <LaneCard key={l.id} lane={l} onPress={() => toast.show('Opening', `${l.name} · ${l.machine}`)} />
                        ))}
                        <FoldChip count={model.quietLanes.length} open={foldOpen} onToggle={() => setFoldOpen(o => !o)} />
                        {foldOpen ? model.quietLanes.map(l => (
                            <LaneCard key={l.id} lane={l} onPress={() => toast.show('Opening', `${l.name} · ${l.machine}`)} />
                        )) : null}

                        <SectionHeader title="Vitals" />
                        <VitalsBlock vitals={model.vitals} />

                        <DigestLine text={model.digest} onPress={() => toast.show('Relay', 'fleet digest')} />

                        <View style={styles.footNote}>
                            <Text style={styles.footText}>
                                Honest-state slice · state lives in the dot, identity in the face.
                                Amber is wedged/blocked (not high-context); idle keeps its colour;
                                only dead / unverified drain to grey.
                            </Text>
                        </View>
                        <View style={styles.pad} />
                    </>
                ) : (
                    <>
                        <SectionHeader title="Continuity" count={`· ${model.threads.length}`} />
                        <ThreadsView threads={model.threads} onOpen={(t: HearthThread) => toast.show('Opening', `${t.seat}${t.machine ? ` · ${t.machine}` : ''}`)} />
                        <View style={styles.pad} />
                    </>
                )}
            </ScrollView>

            {view === 'stream' ? <FAB onPress={() => toast.show('New lane', 'spawn onto the congress')} /> : null}

            <PermissionSheet
                gate={permGate}
                onResolve={(label) => permGate && resolveGate(permGate.id, label.toLowerCase(), permGate.seat)}
                onClose={() => setPermGate(null)}
            />

            {toast.msg ? (
                <Animated.View style={[styles.toast, { opacity: toast.opacity }]} pointerEvents="none">
                    <Text style={styles.toastK}>{toast.msg.k}</Text>
                    {toast.msg.t ? <Text style={styles.toastT}>{toast.msg.t}</Text> : null}
                </Animated.View>
            ) : null}
        </View>
    );
}

export default React.memo(HearthV2Screen);

// styles at the very end of the file (CLAUDE.md)
const styles = StyleSheet.create((theme, runtime) => ({
    root: { flex: 1, backgroundColor: theme.colors.groupped.background },
    scroll: { flex: 1 },
    content: { maxWidth: layout.maxWidth, width: '100%', alignSelf: 'center', paddingTop: 6, paddingBottom: runtime.insets.bottom },
    brandRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: theme.margins.lg + 4, paddingTop: 8, paddingBottom: 4 },
    brand: { fontSize: 22, color: theme.colors.text, ...Typography.logo() },
    brandEm: { color: EMBER },
    tag: { marginLeft: 'auto', fontSize: 11, color: theme.colors.textSecondary, ...Typography.mono() },
    crumb: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 3 },
    crumbText: { fontSize: 13, color: theme.colors.textSecondary, ...Typography.default('semiBold') },

    calm: { marginHorizontal: theme.margins.lg, marginTop: 6, paddingVertical: 14, paddingHorizontal: 14, borderRadius: theme.borderRadius.xl, backgroundColor: theme.colors.surface },
    calmText: { fontSize: 13, color: theme.colors.textSecondary, ...Typography.default() },

    footNote: { paddingHorizontal: theme.margins.lg + 4, paddingTop: 18 },
    footText: { fontSize: 11.5, color: theme.colors.textSecondary, lineHeight: 17, ...Typography.mono() },
    pad: { height: 96 },

    toast: { position: 'absolute', left: 16, right: 16, bottom: 26, backgroundColor: theme.colors.surfaceHighest, borderLeftWidth: 3, borderLeftColor: EMBER, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 },
    toastK: { fontSize: 11, color: EMBER, ...Typography.mono('semiBold') },
    toastT: { fontSize: 13, color: theme.colors.text, marginTop: 2, ...Typography.default() },
}));
