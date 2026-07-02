import * as React from 'react';
import { View, Pressable, ScrollView, LayoutAnimation } from 'react-native';
import { Text } from '@/components/StyledText';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Ionicons } from '@expo/vector-icons';
import { Typography } from '@/constants/Typography';
import { Avatar } from '@/components/Avatar';
import { StatusDot } from '@/components/StatusDot';
import { useNavigateToSession } from '@/hooks/useNavigateToSession';
import { useLaneTail } from '@/hooks/useLaneTail';
import { CongressSeat } from '@/sync/congressTypes';
import { SessionRowData } from '@/sync/storage';
import { deriveLiveness } from '@/sync/liveness';
import { congressIdentity } from '@/utils/congressIdentity';
import { congressHealthStatus, voiceThought, contextPressure } from '@/components/SessionsList';
import { LaneHands } from './laneHands';
import { WorkerFanout } from './WorkerFanout';
import { GREEN, AMBER, RED, GREY, ACCENT_CAGE, isDimmed } from '../colors';
import { useDensity, scaled } from '../density';

export type LaneRow = { session: SessionRowData; seat: CongressSeat | undefined };

// Fail-honest state mapped onto the four-state vocabulary the spec names —
// idle / working / blocked / done — derived from the SAME reconciled liveness +
// health verdict the live tile paints, never a separate hard-coded read.
//
// EXPORTED (contract C4): lane-operator consumes this for the operator pane's
// honest header state + the halt confirmation copy. Signature is frozen:
// (seat, rosterUnreachable, session).
export function laneHonestState(seat: CongressSeat | undefined, rosterUnreachable: boolean, session: SessionRowData): {
    label: 'working' | 'blocked' | 'idle' | 'done' | 'unverified';
    color: string;
} {
    if (!seat) {
        // Plain (non-congress) session — no oracle to reconcile against. Fall back to
        // the session's own connection state, still fail-honest (never a bare "online").
        // G10/G14: 'waiting' (connected, not thinking, no pending permission) is IDLE,
        // not working — it must read the same GREY as every other idle state below.
        // Painting it GREEN made an idle lane indistinguishable from an actively-working
        // one (the exact "online + not-actually-doing-anything" lie the spec bans).
        if (session.state === 'thinking') return { label: 'working', color: GREEN };
        if (session.state === 'permission_required') return { label: 'blocked', color: AMBER };
        if (session.state === 'disconnected') return { label: 'idle', color: GREY };
        return { label: 'idle', color: GREY };
    }
    const { verdict } = deriveLiveness(seat, rosterUnreachable);
    if (verdict === 'unverified') return { label: 'unverified', color: GREY };
    if (verdict === 'dead') return { label: 'done', color: RED };
    if (verdict === 'wedged') return { label: 'blocked', color: AMBER };
    if (verdict === 'idle') return { label: 'idle', color: GREY };
    // 'alive' — reconcile further against the bottleneck direction (blocked-downstream
    // reads as blocked even though the process is alive, mirroring the live tile's glyph).
    if (seat.bottleneck?.direction === 'blocked-downstream') return { label: 'blocked', color: AMBER };
    return { label: 'working', color: GREEN };
}

// CKP-12 — the role glyph badge. A 12px circular sibling View overlapping the
// avatar's bottom-right corner (never a mutation of the Avatar component). The
// glyph reads seat ROLE / tree position, not health: planet=overseer/penthouse,
// git-branch=parent/floor-god, hammer=worker, nothing for a plain session.
function roleGlyph(seat: CongressSeat | undefined, isParent: boolean): 'planet' | 'git-branch' | 'hammer' | null {
    if (!seat) return null; // plain session — no role to badge
    const role = seat.role;
    if (role === 'penthouse') return 'planet';
    if (seat.kind === 'worker' || role === 'worker') return 'hammer';
    if (role === 'floor-god' || isParent) return 'git-branch';
    return null;
}

// CKP-12 — avatar size = tier from TREE POSITION (not role string), so the eye
// reads hierarchy by size: root/penthouse biggest, mid-tree parents medium,
// leaf workers smallest.
function tierAvatarSize(depth: number, isParent: boolean, isWorker: boolean, d: ReturnType<typeof useDensity>): number {
    if (depth === 0) return d.laneAvatarSize;      // root / penthouse
    if (isParent) return 34;                        // mid-tree parent
    if (isWorker) return d.workerAvatarSize;        // leaf worker
    return 34;                                      // nested non-parent session
}

export function LaneTile({ row, rosterUnreachable, selected, workers, laneIndex, depth, boardMode = false, onSelect, isParent = false }: {
    row: LaneRow;
    rosterUnreachable: boolean;
    selected: boolean;
    // This lane's fanned-out worker roster (host+pedal-inferred grouping — see
    // groupWorkersByLane). Empty when the lane has no god->worker fan-out today.
    workers: CongressSeat[];
    // This lane's position in the board — used only to decide the density's
    // auto-expand default (desktop inline-expands the first N lanes; see
    // `autoExpandLanes`). Not an identity, purely a render-default input.
    laneIndex: number;
    // Recursive-tier depth. 0 = root (penthouse/top-level), 1+ = nested under
    // a parent seat. Drives avatar TIER sizing + the role glyph. The visual
    // nesting (rails/elbows) is now owned by TreeGutter at the TheWorkPlane
    // level, so LaneTile no longer applies its own left indent.
    depth: number;
    // CKP-09/16 BOARD column mode: collapsed-only (no chevron/tail/hands,
    // autoExpandLanes ignored), press = onSelect() instead of navigate/expand,
    // selected tile gets a left accent bar. Default false preserves today's
    // deck/phone inline-expand behavior byte-for-byte.
    boardMode?: boolean;
    // Board-mode select handler. Ignored unless boardMode is true.
    onSelect?: () => void;
    // True when this seat has proven tree children (drives the git-branch glyph
    // + the mid-tree avatar tier). Threaded from TheWorkPlane's tree walker.
    isParent?: boolean;
}) {
    const { theme } = useUnistyles();
    const d = useDensity();
    const navigateToSession = useNavigateToSession();
    const [expanded, setExpanded] = React.useState(false);
    const { session, seat } = row;
    const honest = laneHonestState(seat, rosterUnreachable, session);
    const thought = seat ? voiceThought(seat) : null;
    // G11: label by seat ROLE, never by cwd. congressIdentity(seat) already reads
    // role+pedal off the roster — the honest label for a congress lane. A plain
    // (non-congress) session has no role to reconcile against; rather than silently
    // smuggling a cwd fragment in as if it were an identity (the exact "session label
    // = cwd, not role" mistake that cost Carlos a live-overseer archive), say so plainly.
    const identity = seat ? congressIdentity(seat) : 'no seat role — not a congress lane';
    const pressure = seat ? contextPressure(seat) : null;
    const health = seat ? congressHealthStatus(seat, rosterUnreachable) : null;

    // CKP-10 sovereignty — key off cage_status/cage_id, NEVER seat-name prefixes.
    const sealed = seat?.cage_status === 'sealed';

    // CKP-12 monochrome policy — identity drains to grey ONLY for dead/unverified
    // (isDimmed). alive/idle/wedged keep their face; state lives in the dot. For a
    // plain session (no seat) fall back to connection state, never a fake color.
    const verdict = seat ? deriveLiveness(seat, rosterUnreachable).verdict : null;
    const monochrome = verdict != null
        ? isDimmed(verdict)
        : (!health?.isConnected && honest.label !== 'working');

    const isWorker = seat?.kind === 'worker' || seat?.role === 'worker';
    const avatarSize = tierAvatarSize(depth, isParent, isWorker, d);
    const glyph = roleGlyph(seat, isParent);

    // The work-object thought-line: never a bare gerund. voiceThought already distills
    // a specific clause (R1) or an honest idle/quiet fallback (R2/R4) — a plain session
    // with no seat just gets its subtitle (the best honest signal this data layer has).
    const workLine = thought?.text ?? session.subtitle ?? 'no work-object signal yet';

    // Desktop auto-expands this lane's tail inline (spec §3 "terminals expandable
    // inline" — dense multi-lane view); phone/deck stay collapsed to one honest
    // line until tapped. In BOARD mode this is forced off — a board tile is
    // collapsed-only; the tail lives in the operator pane, not the tile.
    const effectiveExpanded = boardMode ? false : (expanded || laneIndex < d.autoExpandLanes);

    // Live output tail (VISION check 7): useLaneTail streams the SAME live message
    // store the session chat screen reads — a real tail, not the oracle's
    // lastAssistantText snapshot. Privacy gate is unchanged: a seat that isn't
    // renderSafe stays gated with the exact same fail-closed treatment as before,
    // regardless of what the tail hook returns. Gated on effectiveExpanded too —
    // sessionId must stay null for a collapsed tile so useLaneTail's loader
    // (sync.onSessionVisible) does NOT fire for every lane on the board.
    const renderSafeGate = !seat || seat.renderSafe === true;
    const { items: tailItems, isLoaded: tailLoaded } = useLaneTail(renderSafeGate && effectiveExpanded ? session.id : null);

    // In board mode a tile press SELECTS (lights the operator pane); everywhere
    // else it navigates to the session as before.
    const onTilePress = React.useCallback(() => {
        if (boardMode) {
            onSelect?.();
        } else {
            navigateToSession(session.id);
        }
    }, [boardMode, onSelect, navigateToSession, session.id]);

    return (
        <Pressable
            style={[
                styles.laneTile,
                { borderRadius: d.cardRadius, paddingVertical: d.cardPaddingV, paddingHorizontal: d.cardPaddingH, marginBottom: d.cardGap, minHeight: Math.max(64, d.minTouchSize + 32) },
                selected && styles.laneTileSelected,
                // Board-mode selection accent — a 2px left bar in the selection
                // accent token (radio.active), NOT a state color (never confuses
                // "selected" with "alive/dead").
                boardMode && selected && { borderLeftWidth: 2, borderLeftColor: theme.colors.radio.active },
            ]}
            onPress={onTilePress}
        >
            <View style={styles.laneTileRow}>
                <View style={styles.laneAvatar}>
                    <Avatar id={seat ? seat.seat : session.avatarId} size={avatarSize} monochrome={monochrome} square={sealed} flavor={session.flavor} />
                    {glyph ? (
                        // CKP-12 role glyph badge — a sibling absolute View, NOT an
                        // Avatar mutation. bg = surface so it reads on any face.
                        <View style={[styles.roleBadge, { backgroundColor: theme.colors.surface }]}>
                            <Ionicons name={glyph} size={9} color={theme.colors.textSecondary} />
                        </View>
                    ) : null}
                </View>
                <View style={styles.laneCenter}>
                    <View style={styles.laneTitleRow}>
                        {sealed ? (
                            // CKP-10 lock badge — 11px teal glyph before the name in a
                            // sealed tile's title row (sovereignty channel 3).
                            <Ionicons name="lock-closed" size={11} color={ACCENT_CAGE} />
                        ) : null}
                        <Text style={[styles.laneTitle, { fontSize: scaled(15, d.typeScale) }]} numberOfLines={1}>{session.name}</Text>
                        {pressure ? (
                            <Text style={[styles.lanePressure, { color: pressure.color, fontSize: scaled(11, d.typeScale) }]}>{pressure.label}</Text>
                        ) : null}
                    </View>
                    <Text style={[styles.laneIdentity, { fontSize: scaled(12, d.typeScale) }]} numberOfLines={1}>{identity}</Text>
                    <View style={styles.laneStatusRow}>
                        <StatusDot color={honest.color} isPulsing={honest.label === 'working'} size={7} />
                        <Text
                            style={[styles.laneThought, { color: honest.color, fontSize: scaled(13, d.typeScale) }, thought?.stale && styles.laneThoughtStale]}
                            numberOfLines={effectiveExpanded ? 4 : 1}
                        >
                            {workLine}
                        </Text>
                    </View>
                </View>
                {/* BOARD mode has no chevron — a board tile is collapsed-only and its
                    detail lives in the operator pane. Deck/phone keep the toggle. */}
                {boardMode ? null : (
                    <Pressable
                        hitSlop={8}
                        onPress={() => {
                            // Cheap-but-classy expand/collapse — the codebase's established
                            // pattern (see (app)/new/index.tsx's config-panel toggle).
                            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                            setExpanded((v) => !v);
                        }}
                        style={[styles.expandToggle, { minWidth: d.minTouchSize, minHeight: d.minTouchSize, alignItems: 'center', justifyContent: 'center' }]}
                    >
                        <Text style={[styles.expandChevron, { fontSize: scaled(14, d.typeScale) }]}>{effectiveExpanded ? '▴' : '▾'}</Text>
                    </Pressable>
                )}
            </View>

            {effectiveExpanded ? (
                <View style={styles.laneTail}>
                    {!renderSafeGate ? (
                        // Same fail-closed privacy treatment lastAssistantText used —
                        // a non-renderSafe seat never gets its transcript painted.
                        <Text style={[styles.laneTailMissing, { fontSize: scaled(12, d.typeScale) }]}>
                            output gated — this seat hasn't published a render-safe transcript signal
                        </Text>
                    ) : !tailLoaded ? (
                        <Text style={[styles.laneTailMissing, { fontSize: scaled(12, d.typeScale) }]}>
                            loading tail…
                        </Text>
                    ) : tailItems.length === 0 ? (
                        <Text style={[styles.laneTailMissing, { fontSize: scaled(12, d.typeScale) }]}>
                            no output yet
                        </Text>
                    ) : d.density === 'desktop' ? (
                        <ScrollView style={styles.laneTailScroll} nestedScrollEnabled>
                            {tailItems.map((item) => (
                                <Text
                                    key={item.id}
                                    style={[styles.laneTailText, { fontSize: scaled(12, d.typeScale) }]}
                                    numberOfLines={3}
                                >
                                    {item.text}
                                </Text>
                            ))}
                        </ScrollView>
                    ) : (
                        tailItems.slice(-4).map((item) => (
                            <Text
                                key={item.id}
                                style={[styles.laneTailText, { fontSize: scaled(12, d.typeScale) }]}
                                numberOfLines={1}
                            >
                                {item.text}
                            </Text>
                        ))
                    )}

                    {/* LANE HANDS (Mission A1): steer + gated halt, expanded tile only.
                        Same renderSafe gate as the tail — a privacy-gated seat is not
                        steerable from this surface (no steering from a lock-screen
                        posture). A SYNTH: seat-only row has no conversable session, so
                        it gets an honest line instead of a dead input. */}
                    {!renderSafeGate ? null : session.id.startsWith('SYNTH:') ? (
                        <Text style={[styles.laneTailMissing, { fontSize: scaled(12, d.typeScale), marginTop: 8 }]}>
                            seat-only lane — no live session to steer or halt
                        </Text>
                    ) : (
                        <LaneHands sessionId={session.id} />
                    )}
                </View>
            ) : null}

            {/* GOD -> WORKER fan-out — always visible when this lane has fanned-out
                workers (mirrors FloorTile: the roster is not gated behind expand).
                Suppressed in board mode — the board is a collapsed index; the
                worker roster belongs to the tree/operator-pane surfaces. */}
            {boardMode ? null : (
                <WorkerFanout workers={workers} rosterUnreachable={rosterUnreachable} inferred />
            )}
        </Pressable>
    );
}

const styles = StyleSheet.create((theme) => ({
    // --- THE WORK lane tiles ---
    laneTile: {
        backgroundColor: theme.colors.surface,
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 14,
        marginBottom: 8,
        // Reserved height discipline (spec's lean invariant) — a lane tile's collapsed
        // row never reflows the tiles below it on poll; expansion is an explicit tap.
        minHeight: 64,
    },
    laneTileSelected: {
        backgroundColor: theme.colors.surfaceSelected,
    },
    laneTileRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    laneAvatar: {
        marginRight: 12,
        position: 'relative',
    },
    // CKP-12 role glyph badge — 12px circle overlapping the avatar bottom-right.
    roleBadge: {
        position: 'absolute',
        right: -2,
        bottom: -2,
        width: 14,
        height: 14,
        borderRadius: 100,
        alignItems: 'center',
        justifyContent: 'center',
    },
    laneCenter: {
        flex: 1,
        justifyContent: 'center',
        minWidth: 0,
    },
    laneTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    laneTitle: {
        flex: 1,
        fontSize: 15,
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
    lanePressure: {
        fontSize: 11,
        ...Typography.default('semiBold'),
    },
    laneIdentity: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        marginTop: 1,
        ...Typography.default(),
    },
    laneStatusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 4,
    },
    laneThought: {
        flex: 1,
        fontSize: 13,
        ...Typography.default('semiBold'),
    },
    laneThoughtStale: {
        fontStyle: 'italic',
        opacity: 0.8,
    },
    expandToggle: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        marginLeft: 4,
    },
    expandChevron: {
        fontSize: 14,
        color: theme.colors.textSecondary,
    },
    laneTail: {
        marginTop: 10,
        paddingTop: 10,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: theme.colors.divider,
    },
    laneTailScroll: {
        maxHeight: 200,
    },
    laneTailText: {
        fontSize: 12,
        lineHeight: 17,
        color: theme.colors.text,
        ...Typography.mono(),
    },
    laneTailMissing: {
        fontSize: 12,
        lineHeight: 17,
        color: theme.colors.textSecondary,
        fontStyle: 'italic',
        ...Typography.default(),
    },
}));
