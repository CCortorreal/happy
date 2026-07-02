import * as React from 'react';
import { View, Pressable, LayoutAnimation } from 'react-native';
import { Text } from '@/components/StyledText';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Ionicons } from '@expo/vector-icons';
import { Typography } from '@/constants/Typography';
import { StatusDot } from '@/components/StatusDot';
import { FeedUnreachable } from '@/components/HonestSignal';
import { useCongressKanban } from '@/hooks/useCongressKanban';
import { CongressFloorBoard } from '@/sync/congressKanbanTypes';
import { armLifecycle, confirmLifecycle, LifecycleAction } from '@/sync/apiCongressOps';
import { KanbanChips } from '../components/KanbanChips';
import { GREY } from '../colors';
import { useDensity, scaled } from '../density';

// ============================================================================
// PLANE 5 — FLOORS (CKP-02 + CKP-19 lifecycle). The building's per-floor kanban
// boards, first-class, PLUS a two-step boot/down ladder per row (arm →
// verbatim-dry-run → confirm). Honest-state throughout: an absent offices root
// (building down) is FeedUnreachable; a boardless-but-readable root is a quiet
// line; every floor row carries its board's mtime age; and the lifecycle ladder
// FAILS CLOSED — if the server can't produce a dry-run preview, no confirm
// control renders (never a blind fire). Phone collapses to tap-to-expand.
// ============================================================================

// Floors whose DOWN is never offered — mirrors the server's NEVER_DOWN set
// (congressOpsRoutes.ts: 'main'/'penthouse'). The control is OMITTED, not
// disabled (the server 403s as a backstop, but the surface never renders a
// button it knows the server will refuse).
const NEVER_DOWN = new Set(['main', 'penthouse']);

// Compact relative age for a board mtime — glanceable staleness, not a clock.
function boardAgeLabel(tsMs: number): string {
    const ageSec = Math.max(0, Math.round((Date.now() - tsMs) / 1000));
    if (ageSec < 60) return `${ageSec}s`;
    if (ageSec < 3600) return `${Math.round(ageSec / 60)}m`;
    if (ageSec < 86400) return `${Math.round(ageSec / 3600)}h`;
    return `${Math.round(ageSec / 86400)}d`;
}

// ---- lifecycle ladder state (per row) --------------------------------------
// The ladder walks: idle → armed(dry-run pending) → dry-run shown (confirm
// available, unless the dry-run failed) → confirming → result. It lives in the
// FloorRow so each row's ladder is independent and collapses cleanly.
type LadderStep =
    | { phase: 'idle' }
    | { phase: 'arming'; action: LifecycleAction }
    | { phase: 'previewed'; action: LifecycleAction; dryRun: string; dryRunKind: string; confirmToken: string }
    // Fail-closed: dry-run couldn't run — NO confirm control renders in this phase.
    | { phase: 'dry-run-failed'; action: LifecycleAction; message: string }
    | { phase: 'refused'; action: LifecycleAction; message: string }
    | { phase: 'confirming'; action: LifecycleAction }
    | { phase: 'done'; action: LifecycleAction; output: string }
    | { phase: 'failed'; action: LifecycleAction; message: string };

const CONFIRM_DISARM_MS = 8000; // UI-side (server token TTL is 120s; UI is stricter).

function FloorRow({ board, typeScale }: { board: CongressFloorBoard; typeScale: number }) {
    const { theme } = useUnistyles();
    const [ladder, setLadder] = React.useState<LadderStep>({ phase: 'idle' });
    const disarmTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const canDown = !NEVER_DOWN.has(board.floor.toLowerCase());

    React.useEffect(() => () => { if (disarmTimer.current) clearTimeout(disarmTimer.current); }, []);

    const collapse = React.useCallback(() => {
        if (disarmTimer.current) clearTimeout(disarmTimer.current);
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setLadder({ phase: 'idle' });
    }, []);

    // ARM — expand the row, POST the dry-run (no confirm), render its verbatim output.
    const arm = React.useCallback(async (action: LifecycleAction) => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setLadder({ phase: 'arming', action });
        const result = await armLifecycle(board.floor, action);
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        if (result.kind === 'armed') {
            setLadder({ phase: 'previewed', action, dryRun: result.dryRun, dryRunKind: result.dryRunKind, confirmToken: result.confirmToken });
        } else if (result.kind === 'dry-run-failed') {
            setLadder({ phase: 'dry-run-failed', action, message: result.message });
        } else if (result.kind === 'refused') {
            setLadder({ phase: 'refused', action, message: result.message });
        } else {
            setLadder({ phase: 'failed', action, message: result.message });
        }
    }, [board.floor]);

    // CONFIRM — POST with the token. 8s UI disarm from previewed; 409 → collapse to
    // step 1 (re-arm) per spec: the stale token is dead, so re-run arm() to fetch a
    // fresh dry-run + valid token rather than stranding the user on a terminal line.
    const confirm = React.useCallback(async (action: LifecycleAction, token: string) => {
        if (disarmTimer.current) clearTimeout(disarmTimer.current);
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setLadder({ phase: 'confirming', action });
        const result = await confirmLifecycle(board.floor, action, token);
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        if (result.kind === 'executed') {
            setLadder({ phase: 'done', action, output: result.output });
        } else if (result.kind === 'expired') {
            // Token expired/mismatched → back to step 1: re-arm with a fresh dry-run.
            arm(action);
        } else {
            setLadder({ phase: 'failed', action, message: result.message });
        }
    }, [board.floor, arm]);

    // Start the 8s UI disarm once a preview is shown (confirm window).
    React.useEffect(() => {
        if (ladder.phase === 'previewed') {
            disarmTimer.current = setTimeout(() => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setLadder({ phase: 'idle' });
            }, CONFIRM_DISARM_MS);
            return () => { if (disarmTimer.current) clearTimeout(disarmTimer.current); };
        }
        return undefined;
    }, [ladder.phase]);

    const isDown = ladder.phase !== 'idle' && ladder.action === 'down';

    return (
        <View style={styles.floorRowWrap}>
            <View style={styles.floorRow}>
                <Text style={[styles.floorRowName, { fontSize: scaled(12.5, typeScale) }]} numberOfLines={1}>
                    {board.floor}
                </Text>
                <KanbanChips counts={board} typeScale={typeScale} />
                <Text style={[styles.floorRowAge, { fontSize: scaled(10.5, typeScale) }]}>
                    {board.total} task{board.total === 1 ? '' : 's'} · board {boardAgeLabel(board.ts)} old
                </Text>
                {/* Right-aligned control cluster: boot (play) + down (square). */}
                {ladder.phase === 'idle' ? (
                    <View style={styles.controls}>
                        <Pressable onPress={() => arm('boot')} style={styles.controlBtn} hitSlop={6}>
                            <Ionicons name="play" size={16} color={theme.colors.textSecondary} />
                        </Pressable>
                        {canDown ? (
                            <Pressable onPress={() => arm('down')} style={styles.controlBtn} hitSlop={6}>
                                <Ionicons name="square" size={16} color={theme.colors.textSecondary} />
                            </Pressable>
                        ) : null}
                    </View>
                ) : null}
            </View>

            {/* --- Lifecycle ladder (inline expansion) --- */}
            {ladder.phase !== 'idle' ? (
                <View style={[styles.ladder, isDown && styles.ladderDown]}>
                    {/* ARM bar — the labeled prompt. */}
                    <View style={styles.ladderBar}>
                        <Text style={[styles.ladderBarLabel, isDown && styles.ladderBarLabelDown]}>
                            {ladder.action === 'down' ? `down ${board.floor}?` : `boot ${board.floor}?`}
                        </Text>
                        <Pressable onPress={collapse} style={styles.ladderCancel} hitSlop={6}>
                            <Ionicons name="close" size={16} color={theme.colors.textSecondary} />
                        </Pressable>
                    </View>

                    {ladder.phase === 'arming' || ladder.phase === 'confirming' ? (
                        <Text style={styles.ladderReading}>
                            {ladder.phase === 'arming' ? 'reading…' : 'sending…'}
                        </Text>
                    ) : null}

                    {/* DRY-RUN preview — verbatim, mono, with the kind caption. */}
                    {ladder.phase === 'previewed' ? (
                        <>
                            <Text style={styles.dryRunCaption}>{ladder.dryRunKind}</Text>
                            <View style={styles.dryRunBox}>
                                <Text style={styles.dryRunText}>{ladder.dryRun || '(no output)'}</Text>
                            </View>
                            {/* CONFIRM — only rendered when a real preview exists. */}
                            <Pressable
                                onPress={() => confirm(ladder.action, ladder.confirmToken)}
                                style={[styles.confirmBtn, ladder.action === 'down' ? styles.confirmDown : styles.confirmBoot]}
                            >
                                <Text style={[styles.confirmText, ladder.action === 'down' && styles.confirmTextDown]}>
                                    {ladder.action === 'down' ? 'CONFIRM DOWN' : 'CONFIRM BOOT'}
                                </Text>
                            </Pressable>
                        </>
                    ) : null}

                    {/* DRY-RUN FAILED — fail-closed: no confirm control, ever. */}
                    {ladder.phase === 'dry-run-failed' ? (
                        <Text style={styles.ladderLoud}>dry-run unreachable — cannot preview; confirm is disabled</Text>
                    ) : null}

                    {ladder.phase === 'refused' ? (
                        <Text style={styles.ladderLoud}>{ladder.message}</Text>
                    ) : null}

                    {/* DONE — claim-honest, with collapsible output. */}
                    {ladder.phase === 'done' ? (
                        <>
                            <Text style={styles.ladderDone}>
                                {ladder.action === 'down' ? 'down sent — watch the floor board' : 'boot sent — watch the floor board'}
                            </Text>
                            {ladder.output ? (
                                <View style={styles.dryRunBox}>
                                    <Text style={styles.dryRunText}>{ladder.output}</Text>
                                </View>
                            ) : null}
                        </>
                    ) : null}

                    {ladder.phase === 'failed' ? (
                        <Text style={styles.ladderLoud}>{ladder.message}</Text>
                    ) : null}
                </View>
            ) : null}
        </View>
    );
}

export function FloorsPlane() {
    const d = useDensity();
    const { floors, unreachable } = useCongressKanban();
    const [phoneExpanded, setPhoneExpanded] = React.useState(false);

    // Honest empty: offices root readable but no floor has a board — the calm
    // all-clear line, same pattern as RelayPlane's quiet state.
    if (floors.length === 0 && !unreachable) {
        return (
            <View style={[styles.plane, { marginBottom: d.planeGap }]}>
                <Text style={[styles.planeTitle, { fontSize: scaled(13, d.typeScale) }]}>FLOORS</Text>
                <View style={styles.quietLineRow}>
                    <StatusDot color={GREY} size={6} />
                    <Text style={[styles.quietLine, { fontSize: scaled(13, d.typeScale) }]}>No floor boards</Text>
                </View>
            </View>
        );
    }

    if (floors.length === 0 && unreachable) {
        return (
            <View style={[styles.plane, { marginBottom: d.planeGap }]}>
                <Text style={[styles.planeTitle, { fontSize: scaled(13, d.typeScale) }]}>FLOORS</Text>
                <View style={[styles.unreachableCard, { borderRadius: d.cardRadius, paddingVertical: d.cardPaddingV, paddingHorizontal: d.cardPaddingH }]}>
                    <FeedUnreachable message="can't reach the floor boards" />
                </View>
            </View>
        );
    }

    if (d.density === 'phone' && !phoneExpanded) {
        return (
            <View style={[styles.plane, { marginBottom: d.planeGap }]}>
                <Pressable onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setPhoneExpanded(true); }}>
                    <Text style={[styles.planeTitle, { fontSize: scaled(13, d.typeScale) }]}>FLOORS · {floors.length} · tap to expand</Text>
                </Pressable>
            </View>
        );
    }

    return (
        <View style={[styles.plane, { marginBottom: d.planeGap }]}>
            <Pressable disabled={d.density !== 'phone'} onPress={() => setPhoneExpanded(false)}>
                <Text style={[styles.planeTitle, { fontSize: scaled(13, d.typeScale) }]}>FLOORS · {floors.length}</Text>
            </Pressable>
            {floors.map((board) => <FloorRow key={board.floor} board={board} typeScale={d.typeScale} />)}
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
    // Boring-when-healthy: a thin quiet line, never an empty labeled box.
    quietLineRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 8,
        paddingHorizontal: 4,
    },
    quietLine: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        ...Typography.default(),
    },
    // LOUD-but-considered: a dead feed gets a card, not a bare line — the destructive
    // TOKEN border makes it unmissable without inventing a second alarm color.
    unreachableCard: {
        backgroundColor: theme.colors.surface,
        borderLeftWidth: 3,
        borderLeftColor: theme.colors.textDestructive,
    },

    // --- FLOORS plane (CKP-02) ---
    floorRowWrap: {
        marginBottom: 4,
    },
    floorRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    floorRowName: {
        minWidth: 72,
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
    floorRowAge: {
        marginLeft: 'auto',
        color: theme.colors.textSecondary,
        ...Typography.mono(),
    },
    // --- lifecycle controls (CKP-19) ---
    controls: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
        marginLeft: 8,
    },
    controlBtn: {
        width: 32,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    // Inline ladder expansion
    ladder: {
        marginTop: 6,
        padding: 10,
        borderRadius: 8,
        backgroundColor: theme.colors.groupped.background,
    },
    ladderDown: {
        backgroundColor: theme.colors.box.error.background,
        borderWidth: 1,
        borderColor: theme.colors.box.error.border,
    },
    ladderBar: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    ladderBarLabel: {
        flex: 1,
        fontSize: 13,
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
    ladderBarLabelDown: {
        color: theme.colors.box.error.text,
    },
    ladderCancel: {
        width: 28,
        height: 28,
        alignItems: 'center',
        justifyContent: 'center',
    },
    ladderReading: {
        marginTop: 6,
        fontSize: 12,
        color: theme.colors.textSecondary,
        fontStyle: 'italic',
        ...Typography.default(),
    },
    dryRunCaption: {
        marginTop: 8,
        fontSize: 10.5,
        color: theme.colors.textSecondary,
        ...Typography.default(),
    },
    dryRunBox: {
        marginTop: 4,
        padding: 8,
        borderRadius: 6,
        backgroundColor: theme.colors.surfaceHighest,
    },
    dryRunText: {
        fontSize: 11,
        lineHeight: 15,
        color: theme.colors.text,
        ...Typography.mono(),
    },
    confirmBtn: {
        marginTop: 8,
        minHeight: 40,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 14,
    },
    confirmBoot: {
        backgroundColor: theme.colors.button.primary.background,
    },
    confirmDown: {
        backgroundColor: theme.colors.textDestructive,
    },
    confirmText: {
        fontSize: 13,
        color: theme.colors.button.primary.tint,
        ...Typography.default('semiBold'),
    },
    confirmTextDown: {
        color: '#FFFFFF',
    },
    ladderDone: {
        marginTop: 6,
        fontSize: 12,
        color: theme.colors.textSecondary,
        fontStyle: 'italic',
        ...Typography.default(),
    },
    ladderLoud: {
        marginTop: 6,
        fontSize: 12,
        color: theme.colors.box.error.text,
        ...Typography.default('semiBold'),
    },
}));
