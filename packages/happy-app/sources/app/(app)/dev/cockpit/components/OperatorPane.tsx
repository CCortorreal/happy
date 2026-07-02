import * as React from 'react';
import { View, ScrollView, TextInput, Pressable, Platform, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { Text } from '@/components/StyledText';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Ionicons } from '@expo/vector-icons';
import { Typography } from '@/constants/Typography';
import { Avatar } from '@/components/Avatar';
import { StatusDot } from '@/components/StatusDot';
import { useSession } from '@/sync/storage';
import { useCongressRoster } from '@/hooks/useCongressRoster';
import { useLaneTail } from '@/hooks/useLaneTail';
import { useNavigateToSession } from '@/hooks/useNavigateToSession';
import { deriveLiveness } from '@/sync/liveness';
import { congressIdentity } from '@/utils/congressIdentity';
import { contextPressure } from '@/components/SessionsList';
import { getSessionName } from '@/utils/sessionUtils';
import { CongressSeat } from '@/sync/congressTypes';
import { CockpitSelectionContext } from '../selection';
import { ACCENT_CAGE, isDimmed } from '../colors';
import { laneHonestState } from './LaneTile';
import { useLaneHands } from './laneHands';

// ============================================================================
// OPERATOR PANE (CKP-18) — the lit workbench. Desktop-only this pass: lane-noc
// mounts it in Column B whenever a lane is selected. It is the single place a
// congress lane is STEERED (the visually heaviest element is the steer dock)
// and HALTED (CKP-20, two-step guarded), both via the ONE shared useLaneHands
// transport (no forked send/abort path — the tile hands and this pane agree).
//
// Anatomy top→bottom: identity header (avatar · name · identity · honest dot +
// pressure · HALT + open-full + × / Esc) → sealed one-liner (caged seats only)
// → live tail (own scroll, pinned-to-bottom, jump-to-live pill on scroll-up) →
// steer dock (multiline input + send). Honest-state discipline throughout:
// a dead lane keeps its tail history but disables steer with the honest line;
// a privacy-gated seat never paints raw output; HALT never claims a success the
// feed hasn't confirmed.
// ============================================================================

const HALT_COUNTDOWN_SECS = 5;
const HALT_LANDED_TIMEOUT_MS = 30_000;
const JUMP_PILL_THRESHOLD_PX = 80;

// Mirrors TheWorkPlane.seatFor but keyed by an explicit seatId first (the board
// tile passed the seat it painted), then the session's claudeSessionId / id —
// so the pane resolves the SAME seat the tile did.
function resolveSeat(
    seatId: string | null | undefined,
    claudeSessionId: string | null | undefined,
    sessionId: string,
    roster: Map<string, CongressSeat>,
): CongressSeat | undefined {
    if (seatId) {
        for (const seat of roster.values()) {
            if (seat.seat === seatId) return seat;
        }
    }
    return (claudeSessionId != null ? roster.get(claudeSessionId) : undefined) ?? roster.get(sessionId);
}

export const OperatorPane = React.memo(function OperatorPane({ sessionId, seatId }: {
    sessionId: string;
    seatId?: string | null;
}) {
    const { theme } = useUnistyles();
    const selection = React.useContext(CockpitSelectionContext);
    const navigateToSession = useNavigateToSession();
    const session = useSession(sessionId);
    const { sessions: roster, unreachable: rosterUnreachable } = useCongressRoster();

    const seat = resolveSeat(seatId, session?.metadata?.claudeSessionId ?? null, sessionId, roster);
    const sessionName = session ? getSessionName(session) : sessionId;
    const identity = seat ? congressIdentity(seat) : 'no seat role — not a congress lane';
    const pressure = seat ? contextPressure(seat) : null;
    const liveness = deriveLiveness(seat, rosterUnreachable);
    const isDead = liveness.verdict === 'dead';

    // Honest state label/color — the SAME derivation the board tile paints, so
    // the pane header and its board tile can never disagree. A non-congress
    // session with no live row falls back through laneHonestState's session branch.
    const honest = React.useMemo(() => {
        if (!session) {
            // No live session row (rare — selected then archived). Honest, never green.
            return { label: 'idle' as const, color: theme.colors.textSecondary };
        }
        // laneHonestState wants a SessionRowData shape; session.state maps cleanly.
        const state = session.thinking ? 'thinking'
            : (session.agentState?.requests && Object.keys(session.agentState.requests).length > 0) ? 'permission_required'
            : session.presence === 'online' ? 'waiting' : 'disconnected';
        return laneHonestState(seat, rosterUnreachable, {
            id: sessionId,
            name: sessionName,
            subtitle: '',
            avatarId: sessionId,
            flavor: null,
            state,
            hasDraft: false,
            active: session.active,
            machineId: null,
            path: null,
            homeDir: null,
            completedTodosCount: 0,
            totalTodosCount: 0,
            hasUnread: false,
            claudeSessionId: session.metadata?.claudeSessionId ?? null,
        });
    }, [session, seat, rosterUnreachable, sessionId, sessionName, theme.colors.textSecondary]);

    const sealed = seat?.cage_status === 'sealed';
    const dimmed = seat ? isDimmed(liveness.verdict) : false;

    // The one shared transport for steer + halt (C15). No forked path.
    const hands = useLaneHands(sessionId);

    // --- CKP-20 HALT extra state (graft 3: never claim success the feed hasn't
    // confirmed). After fireHalt(), we hold the watch across BOTH 'firing' and
    // 'sent' and watch the honest label + session.thinking; when the lane's own
    // state reflects the abort we release with the landed chip, or 30s honest-
    // timeout → loud unchanged chip.
    //
    // CRITICAL: the watch is latched, NOT keyed on the transient 'firing' boolean.
    // fireHalt() sets 'firing' then flips to 'sent' on the abort RPC *ack* (tens-
    // to-hundreds of ms — long before the lane actually stops). Keying off 'firing'
    // would tear down the watcher + 30s timer at ack time, so neither the landed
    // nor the timeout chip could ever fire. Instead `awaitingHalt` latches true the
    // moment we enter 'firing'/'sent' and only clears on landed/timeout/failed. ---
    const [haltCountdown, setHaltCountdown] = React.useState(HALT_COUNTDOWN_SECS);
    const [haltLanded, setHaltLanded] = React.useState<'none' | 'landed' | 'timeout'>('none');
    const [awaitingHalt, setAwaitingHalt] = React.useState(false);
    const countdownTimer = React.useRef<ReturnType<typeof setInterval> | null>(null);
    const landedTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    // Snapshot of "was the lane working when we fired" — the abort has landed once
    // it is no longer thinking/working.
    const firedWhileWorking = React.useRef(false);
    // Guards the latch to fire exactly ONCE per in-flight episode. 'sent' lingers in
    // the hook forever (nothing resets it to 'idle'), so haltInFlight stays true past
    // the outcome; without this guard the latch effect would re-arm the 30s timer on
    // every render after landed/timeout. Reset when the episode fully ends (idle/armed).
    const latchedEpisode = React.useRef(false);

    const armed = hands.haltState === 'armed';
    const firing = hands.haltState === 'firing';
    // The fire is in flight from the moment it is sent ('firing') until the abort
    // RPC acks ('sent'). Both are the same "awaiting the feed" phase for the watch.
    const haltInFlight = firing || hands.haltState === 'sent';

    // Countdown while armed.
    React.useEffect(() => {
        if (armed) {
            setHaltCountdown(HALT_COUNTDOWN_SECS);
            countdownTimer.current = setInterval(() => {
                setHaltCountdown((c) => Math.max(0, c - 1));
            }, 1000);
            return () => { if (countdownTimer.current) clearInterval(countdownTimer.current); };
        }
        if (countdownTimer.current) clearInterval(countdownTimer.current);
        return undefined;
    }, [armed]);

    // Latch the watch when the fire goes in flight. Snapshots "was the lane working"
    // and arms the 30s honest-timeout HERE (the effect that owns the latch), so the
    // ref is written before the watcher below reads it. `latchedEpisode` makes this
    // fire once per fire (haltInFlight lingers at 'sent'); the latch survives the fast
    // 'firing'→'sent' RPC ack and is cleared only by the watcher/timeout/failed below.
    React.useEffect(() => {
        if (haltInFlight && !latchedEpisode.current) {
            latchedEpisode.current = true;
            firedWhileWorking.current = honest.label === 'working' || !!session?.thinking;
            setHaltLanded('none');
            setAwaitingHalt(true);
            landedTimer.current = setTimeout(() => {
                setHaltLanded('timeout');
                setAwaitingHalt(false);
            }, HALT_LANDED_TIMEOUT_MS);
        } else if (!haltInFlight) {
            // Episode fully ended (back to idle/armed) — allow the next fire to latch.
            latchedEpisode.current = false;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [haltInFlight]);

    // Graft 3: watch the honest state while awaiting. Working label OR
    // session.thinking still true means the abort hasn't landed yet.
    const laneStillWorking = honest.label === 'working' || !!session?.thinking;
    React.useEffect(() => {
        if (awaitingHalt && firedWhileWorking.current && !laneStillWorking) {
            // The lane's own state now reflects the abort — honest success.
            setHaltLanded('landed');
            setAwaitingHalt(false);
            if (landedTimer.current) clearTimeout(landedTimer.current);
        }
    }, [awaitingHalt, laneStillWorking]);

    // A failed abort clears the watch — the failed chip owns the outcome instead.
    React.useEffect(() => {
        if (hands.haltState === 'failed' && awaitingHalt) {
            setAwaitingHalt(false);
            if (landedTimer.current) clearTimeout(landedTimer.current);
        }
    }, [hands.haltState, awaitingHalt]);

    // Clear the honest-timeout timer on unmount (the countdown timer owns its own).
    React.useEffect(() => () => { if (landedTimer.current) clearTimeout(landedTimer.current); }, []);

    const onHaltPress = React.useCallback(() => {
        if (armed) {
            hands.fireHalt();
        } else if (!awaitingHalt) {
            // Not while a prior fire's outcome is still being watched; fine once it
            // has resolved even though the hook's haltState lingers at 'sent'.
            hands.armHalt();
        }
    }, [armed, awaitingHalt, hands]);

    const clearSelection = React.useCallback(() => {
        // Any armed halt disarms when the pane is dismissed (CKP-20: any other
        // interaction disarms).
        hands.disarmHalt();
        selection.clear();
    }, [hands, selection]);

    // Web-only Esc clears the selection. useGlobalKeyboard is K-only (verified),
    // so this hand-rolls a keydown listener scoped to Escape — same web-only
    // window pattern useGlobalKeyboard itself uses.
    React.useEffect(() => {
        if (Platform.OS !== 'web') return undefined;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (armed) { hands.disarmHalt(); return; }
                clearSelection();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [armed, hands, clearSelection]);

    // --- tail scroll / jump-to-live (graft 4) ---
    // Gate the subscription itself on renderSafe (defense-in-depth, EXACT-matching
    // LaneTile's gate): a non-render-safe seat's transcript is never even fetched
    // into memory, not merely hidden at render. useLaneTail no-ops on a null id.
    const renderSafeGate = !seat || seat.renderSafe === true;
    const { items: tailItems, isLoaded: tailLoaded } = useLaneTail(renderSafeGate ? sessionId : null);
    const scrollRef = React.useRef<ScrollView>(null);
    const [autoFollow, setAutoFollow] = React.useState(true);

    const onTailScroll = React.useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
        const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
        // Scrolled up beyond the threshold → suspend auto-follow and show the pill.
        setAutoFollow(distanceFromBottom <= JUMP_PILL_THRESHOLD_PX);
    }, []);

    const jumpToLive = React.useCallback(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
        setAutoFollow(true);
    }, []);

    // Keep pinned-to-bottom while following.
    React.useEffect(() => {
        if (autoFollow && renderSafeGate) {
            scrollRef.current?.scrollToEnd({ animated: false });
        }
    }, [tailItems, autoFollow, renderSafeGate]);

    // Send on web Enter (Shift+Enter = newline).
    const onInputKeyPress = React.useCallback((e: any) => {
        if (Platform.OS !== 'web') return;
        if (e?.nativeEvent?.key === 'Enter' && !e?.nativeEvent?.shiftKey) {
            e.preventDefault?.();
            if (!isDead) hands.send();
        }
    }, [hands, isDead]);

    const draftEmpty = hands.draft.trim().length === 0;

    // HALT chip (below-header) — honest outcome, never a claim the feed hasn't shown.
    // While the fire is in flight (post-ack, pre-outcome) we say EXACTLY what we
    // know: the abort was sent and we're watching the lane's own state — no success
    // claimed until the feed confirms it (landed) or the 30s honest-timeout expires.
    const haltChip = React.useMemo(() => {
        if (hands.haltState === 'failed') return { text: 'halt failed — lane didn\'t take the abort', loud: true };
        if (haltLanded === 'landed') return { text: 'halt landed — lane state reflects the abort', loud: false };
        if (haltLanded === 'timeout') return { text: 'halt sent — lane state unchanged', loud: true };
        if (awaitingHalt) return { text: 'halt sent — watching the lane state', loud: false };
        return null;
    }, [hands.haltState, haltLanded, awaitingHalt]);

    return (
        <View style={[styles.pane, armed && styles.paneArmedRing]}>
            {/* (1) IDENTITY HEADER */}
            <View style={styles.header}>
                <View style={styles.headerAvatar}>
                    <Avatar id={seat ? seat.seat : sessionId} size={40} square={sealed} monochrome={dimmed} flavor={session?.metadata?.flavor ?? null} />
                </View>
                <View style={styles.headerCenter}>
                    <Text style={styles.headerName} numberOfLines={1}>{sessionName}</Text>
                    <Text style={styles.headerIdentity} numberOfLines={1}>{identity}</Text>
                    <View style={styles.headerStatusRow}>
                        <StatusDot color={honest.color} isPulsing={honest.label === 'working'} size={7} />
                        <Text style={[styles.headerStatusLabel, { color: honest.color }]}>{honest.label}</Text>
                        {pressure ? (
                            <Text style={[styles.headerPressure, { color: pressure.color }]}>{pressure.label}</Text>
                        ) : null}
                    </View>
                </View>
                <View style={styles.headerActions}>
                    {/* HALT (CKP-20) — far right, two-step guarded. */}
                    <Pressable
                        onPress={onHaltPress}
                        disabled={awaitingHalt}
                        style={[
                            styles.haltButton,
                            armed && styles.haltButtonArmed,
                            awaitingHalt && styles.haltButtonFiring,
                        ]}
                    >
                        {awaitingHalt ? (
                            <Text style={styles.haltFiringText}>halting…</Text>
                        ) : armed ? (
                            <Text style={styles.haltArmedText}>{`CONFIRM HALT · ${haltCountdown}`}</Text>
                        ) : (
                            <View style={styles.haltIdleInner}>
                                <Ionicons name="stop-circle-outline" size={15} color={theme.colors.textDestructive} />
                                <Text style={styles.haltIdleText}>HALT</Text>
                            </View>
                        )}
                    </Pressable>
                    <Pressable onPress={() => navigateToSession(sessionId)} style={styles.openFull} hitSlop={6}>
                        <Text style={styles.openFullText}>open full session ↗</Text>
                    </Pressable>
                    <Pressable onPress={clearSelection} style={styles.clearButton} hitSlop={6}>
                        <Ionicons name="close" size={18} color={theme.colors.textSecondary} />
                    </Pressable>
                </View>
            </View>

            {/* Sealed one-liner — caged seats only, persistent, teal. */}
            {sealed ? (
                <Text style={styles.sealedLine} numberOfLines={2}>
                    {`sealed — runs inside ${seat?.cage_id ?? 'cage unknown'}, host cannot reach its filesystem`}
                </Text>
            ) : null}

            {/* HALT outcome chip (honest). */}
            {haltChip ? (
                <Text style={[styles.haltChip, haltChip.loud && styles.haltChipLoud]}>{haltChip.text}</Text>
            ) : null}

            {/* (2) TAIL */}
            <View style={styles.tailWrap}>
                {!renderSafeGate ? (
                    <View style={styles.tailPad}>
                        <Text style={styles.tailMissing}>output gated — this seat hasn't published a render-safe transcript signal</Text>
                    </View>
                ) : !tailLoaded ? (
                    <View style={styles.tailPad}>
                        <Text style={styles.tailMissing}>loading tail…</Text>
                    </View>
                ) : tailItems.length === 0 ? (
                    <View style={styles.tailPad}>
                        <Text style={styles.tailMissing}>no output yet</Text>
                    </View>
                ) : (
                    <ScrollView
                        ref={scrollRef}
                        style={styles.tailScroll}
                        contentContainerStyle={styles.tailScrollContent}
                        onScroll={onTailScroll}
                        scrollEventThrottle={100}
                    >
                        {tailItems.map((item) => (
                            <Text key={item.id} style={styles.tailText}>{item.text}</Text>
                        ))}
                    </ScrollView>
                )}
                {/* Graft 4: jump-to-live pill when scrolled up. */}
                {renderSafeGate && tailLoaded && tailItems.length > 0 && !autoFollow ? (
                    <Pressable style={styles.jumpPill} onPress={jumpToLive}>
                        <Text style={styles.jumpPillText}>jump to live ↓</Text>
                    </Pressable>
                ) : null}
            </View>

            {/* (3) STEER DOCK — the visually heaviest element. */}
            <View style={styles.steerDock}>
                {isDead ? (
                    <Text style={styles.steerDisabledLine}>lane is dark — steer has nowhere to land</Text>
                ) : null}
                <View style={styles.steerRow}>
                    <TextInput
                        style={styles.steerInput}
                        value={hands.draft}
                        onChangeText={hands.setDraft}
                        editable={!isDead}
                        multiline
                        placeholder="steer — inject context into this lane"
                        placeholderTextColor={theme.colors.textSecondary}
                        onKeyPress={onInputKeyPress}
                    />
                    <Pressable
                        onPress={() => { if (!isDead) hands.send(); }}
                        disabled={isDead || draftEmpty}
                        style={[styles.sendButton, (isDead || draftEmpty) && styles.sendButtonDisabled]}
                    >
                        <Ionicons name="paper-plane" size={18} color={theme.colors.button.primary.tint} />
                    </Pressable>
                </View>
                {hands.steerState === 'sent' ? (
                    <Text style={styles.steerChip}>steered ·</Text>
                ) : hands.steerState === 'failed' ? (
                    <Text style={styles.steerChipFailed}>steer failed — didn't reach the lane</Text>
                ) : null}
            </View>
        </View>
    );
});

const styles = StyleSheet.create((theme) => ({
    pane: {
        flex: 1,
        backgroundColor: theme.colors.surface,
    },
    // CKP-20: armed halt puts a 1px error-border ring around the whole pane.
    paneArmedRing: {
        borderWidth: 1,
        borderColor: theme.colors.box.error.border,
    },
    // (1) IDENTITY HEADER
    header: {
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.divider,
        gap: 12,
    },
    headerAvatar: {},
    headerCenter: {
        flex: 1,
        minWidth: 0,
        justifyContent: 'center',
    },
    headerName: {
        fontSize: 16,
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
    headerIdentity: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        marginTop: 1,
        ...Typography.default(),
    },
    headerStatusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 3,
    },
    headerStatusLabel: {
        fontSize: 12,
        ...Typography.default('semiBold'),
    },
    headerPressure: {
        fontSize: 11,
        marginLeft: 2,
        ...Typography.default('semiBold'),
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    // HALT button
    haltButton: {
        minWidth: 96,
        minHeight: 44,
        borderWidth: 1.5,
        borderColor: theme.colors.textDestructive,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 10,
    },
    haltButtonArmed: {
        backgroundColor: theme.colors.textDestructive,
        borderColor: theme.colors.textDestructive,
    },
    haltButtonFiring: {
        opacity: 0.5,
    },
    haltIdleInner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    haltIdleText: {
        fontSize: 13,
        color: theme.colors.textDestructive,
        ...Typography.default('semiBold'),
    },
    haltArmedText: {
        fontSize: 13,
        color: '#FFFFFF',
        ...Typography.default('semiBold'),
    },
    haltFiringText: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        ...Typography.default('semiBold'),
    },
    openFull: {},
    openFullText: {
        fontSize: 12,
        color: theme.colors.textLink,
        ...Typography.default(),
    },
    clearButton: {
        width: 32,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    // Sealed one-liner
    sealedLine: {
        fontSize: 11,
        color: ACCENT_CAGE,
        paddingHorizontal: 16,
        paddingTop: 8,
        ...Typography.default(),
    },
    // HALT outcome chip
    haltChip: {
        fontSize: 11,
        color: theme.colors.textSecondary,
        paddingHorizontal: 16,
        paddingTop: 8,
        fontStyle: 'italic',
        ...Typography.default(),
    },
    haltChipLoud: {
        color: theme.colors.box.error.text,
        fontStyle: 'normal',
        ...Typography.default('semiBold'),
    },
    // (2) TAIL
    tailWrap: {
        flex: 1,
        minHeight: 0,
        position: 'relative',
    },
    tailPad: {
        paddingHorizontal: 16,
        paddingTop: 12,
    },
    tailScroll: {
        flex: 1,
    },
    tailScrollContent: {
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    tailText: {
        fontSize: 12.5,
        lineHeight: 18,
        color: theme.colors.text,
        ...Typography.mono(),
    },
    tailMissing: {
        fontSize: 12.5,
        lineHeight: 18,
        color: theme.colors.textSecondary,
        fontStyle: 'italic',
        ...Typography.default(),
    },
    // Graft 4 jump-to-live pill
    jumpPill: {
        position: 'absolute',
        bottom: 12,
        alignSelf: 'center',
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.divider,
        borderRadius: 16,
        paddingHorizontal: 14,
        paddingVertical: 6,
    },
    jumpPillText: {
        fontSize: 12,
        color: theme.colors.textLink,
        ...Typography.default('semiBold'),
    },
    // (3) STEER DOCK — heaviest element
    steerDock: {
        borderTopWidth: 1,
        borderTopColor: theme.colors.divider,
        backgroundColor: theme.colors.surface,
        padding: 12,
    },
    steerDisabledLine: {
        fontSize: 12,
        color: theme.colors.box.error.text,
        marginBottom: 8,
        ...Typography.default('semiBold'),
    },
    steerRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 8,
    },
    steerInput: {
        flex: 1,
        minHeight: 44,
        maxHeight: 120,
        backgroundColor: theme.colors.input.background,
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 14,
        color: theme.colors.text,
        ...Typography.default(),
    },
    sendButton: {
        width: 44,
        height: 44,
        borderRadius: 10,
        backgroundColor: theme.colors.button.primary.background,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sendButtonDisabled: {
        opacity: 0.4,
    },
    steerChip: {
        marginTop: 6,
        fontSize: 11,
        color: theme.colors.textSecondary,
        fontStyle: 'italic',
        ...Typography.default(),
    },
    steerChipFailed: {
        marginTop: 6,
        fontSize: 11,
        color: theme.colors.box.error.text,
        ...Typography.default('semiBold'),
    },
}));
