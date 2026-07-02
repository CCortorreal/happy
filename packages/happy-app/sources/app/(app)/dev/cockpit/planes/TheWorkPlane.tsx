import * as React from 'react';
import { View, Pressable, LayoutAnimation } from 'react-native';
import { Text } from '@/components/StyledText';
import { StyleSheet } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { Avatar } from '@/components/Avatar';
import { StatusDot } from '@/components/StatusDot';
import { useVisibleSessionListViewData } from '@/hooks/useVisibleSessionListViewData';
import { useCongressRoster } from '@/hooks/useCongressRoster';
import { useCongressTree, CongressTreeNode } from '@/hooks/useCongressTree';
import { CongressSeat } from '@/sync/congressTypes';
import { SessionRowData } from '@/sync/storage';
import { deriveLiveness } from '@/sync/liveness';
import { LaneTile, type LaneRow } from '../components/LaneTile';
import { TreeGutter } from '../components/TreeGutter';
import { CageGroup } from '../components/CageGroup';
import { WorkerAvatar, WORKER_AVATAR_SHOWN } from '../components/WorkerFanout';
import { CockpitSelectionContext } from '../selection';
import { GREY, isDimmed } from '../colors';
import { useDensity, scaled } from '../density';

// ============================================================================
// PLANE 2 — THE WORK (the living center, default focus). One tile per active
// lane/session. Honest state is DERIVED from the same fresh-probe machinery the
// live surface uses (deriveLiveness + congressHealthStatus) — never a hard green.
// The thought-line reuses voiceThought (banned-gerund rule already enforced there:
// R1 distills a specific clause, never a bare "building"/"overseeing").
// ============================================================================

function seatFor(s: SessionRowData, roster: Map<string, CongressSeat>): CongressSeat | undefined {
    return (s.claudeSessionId != null ? roster.get(s.claudeSessionId) : undefined) ?? roster.get(s.id);
}

// ----------------------------------------------------------------------------
// GOD -> WORKER FAN-OUT (mirrors the munder building's FloorTile: god on top,
// its worker roster underneath). The roster (GET /v1/congress/roster) already
// separates session rows from worker rows (kind==='worker', no cuid — a worker
// is watched, not conversable, so it never JOINs onto a session the way a
// god/session lane does). There is NO clean parent-lane linkage field for a
// worker in CongressSeatSchema today (grepped — no laneId/parentSeat/ownerCuid
// exists), so grouping falls back to the best available signal: host+pedal
// proximity to the candidate god lane's own seat. This is an INFERRED grouping,
// not a proven one — marked honestly (§0: no faked hierarchy) rather than
// silently presented as a hard parent/child link.
function workerGroupKey(w: CongressSeat): string | null {
    const host = w.host?.trim();
    const pedal = w.pedal?.trim();
    if (host && pedal) return `${host}::${pedal}`;
    return null;
}

function laneGroupKey(seat: CongressSeat | undefined): string | null {
    if (!seat) return null;
    const host = seat.host?.trim();
    const pedal = seat.pedal?.trim();
    if (host && pedal) return `${host}::${pedal}`;
    return null;
}

// Groups every worker row under the god lane sharing its host+pedal signal.
// Workers with no matching lane (no signal, or the signal matches no lane on
// screen) land in a separate "ungrouped" bucket — rendered honestly as its own
// row, never smuggled under a lane it wasn't actually inferred to belong to.
function groupWorkersByLane(lanes: LaneRow[], workers: CongressSeat[]): {
    byLane: Map<string, CongressSeat[]>;
    ungrouped: CongressSeat[];
} {
    const laneKeys = new Map<string, string>(); // groupKey -> session.id
    for (const row of lanes) {
        const key = laneGroupKey(row.seat);
        if (key && !laneKeys.has(key)) laneKeys.set(key, row.session.id);
    }
    const byLane = new Map<string, CongressSeat[]>();
    const ungrouped: CongressSeat[] = [];
    for (const w of workers) {
        const key = workerGroupKey(w);
        const sessionId = key ? laneKeys.get(key) : undefined;
        if (sessionId) {
            const list = byLane.get(sessionId) ?? [];
            list.push(w);
            byLane.set(sessionId, list);
        } else {
            ungrouped.push(w);
        }
    }
    return { byLane, ungrouped };
}

// Synthesizes a minimal SessionRowData from a seat that has no live session
// row (mock nodes, or roster-only seats that never appeared in the sessions
// view-model). LaneTile keys its title/navigate off SessionRowData; the mock
// tree needs something to render against without wiring in a whole fake
// Session object. Marked honestly with `SYNTH:` prefix in the id so a
// consumer that stumbles into a synthesized row while debugging sees it's not
// a real session id.
function synthesizeSessionRowFromSeat(seat: CongressSeat): SessionRowData {
    return {
        id: `SYNTH:${seat.seat}`,
        name: seat.seat,
        subtitle: seat.currentWork ?? seat.pedal ?? 'seat-only (no session row)',
        avatarId: seat.seat,
        flavor: null,
        state: 'waiting',
        hasDraft: false,
        // Reconciled, not raw (PR-14's rule): the old `seat.verdict === 'alive'`
        // compared lowercase against the oracle's UPPERCASE vocab — always false.
        active: deriveLiveness(seat, false).verdict === 'alive',
        machineId: null,
        path: null,
        homeDir: null,
        completedTodosCount: 0,
        totalTodosCount: 0,
        hasUnread: false,
        claudeSessionId: seat.claudeSid ?? null,
    };
}

export function TheWorkPlane({ selectedSessionId, mockRoster, boardMode = false }: {
    selectedSessionId?: string;
    // DEV-ONLY: when non-null, TheWorkPlane consumes the tree hydrated from
    // this fixture instead of the live congress roster. Wired to the "Mock
    // recursive roster" toggle at the top of CockpitV2. Never non-null on the
    // live surface (dev route only).
    mockRoster?: CongressSeat[] | null;
    // CKP-09/16 desktop BOARD column: when true every tile renders collapsed-
    // only (no chevron, no inline tail, no inline LaneHands; autoExpandLanes
    // ignored), tile press SELECTS into the operator pane instead of
    // expanding/navigating, and the selected tile gets a left accent bar.
    // Default false preserves today's deck/phone inline-expand behavior exactly.
    boardMode?: boolean;
}) {
    const d = useDensity();
    const data = useVisibleSessionListViewData();
    const { sessions: roster, workers, unreachable: rosterUnreachable } = useCongressRoster();
    const tree = useCongressTree(mockRoster ?? null);
    const selection = React.useContext(CockpitSelectionContext);

    // CKP-11 collapse state — a local Set of collapsed seat ids. A parent tile
    // shows a `▾ N` chip; collapsing hides its subtree and shows a stacked
    // children-avatar preview next to the chip (graft 10). Local-only (view
    // state, not roster truth) so it never leaks into liveness/selection.
    const [collapsed, setCollapsed] = React.useState<Set<string>>(() => new Set());
    const toggleCollapse = React.useCallback((seatId: string) => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setCollapsed((prev) => {
            const next = new Set(prev);
            if (next.has(seatId)) next.delete(seatId);
            else next.add(seatId);
            return next;
        });
    }, []);

    // Flatten the view-model to a plain lane list — THE WORK is the living center,
    // not a list buried under a gauge, so Slice 1 renders every lane as an equal tile
    // (no date/project grouping ceremony; that's browse-chrome, not the work board).
    const lanes: LaneRow[] = React.useMemo(() => {
        if (!data) return [];
        const rows: SessionRowData[] = [];
        for (const item of data) {
            if (item.type === 'session') rows.push(item.session);
            else if (item.type === 'active-sessions') rows.push(...item.sessions);
        }
        return rows.map((session) => ({ session, seat: seatFor(session, roster) }));
    }, [data, roster]);

    // GOD -> WORKER fan-out: group the already-served worker rows under their
    // best-signal parent lane (host+pedal proximity — see groupWorkersByLane).
    // Any worker with no matching lane on screen renders in its own honest
    // "ungrouped" bucket rather than being hidden or force-fit under a lane.
    const { byLane: workersByLane, ungrouped: ungroupedWorkers } = React.useMemo(
        () => groupWorkersByLane(lanes, workers),
        [lanes, workers],
    );

    // Live-session lookup by seat id — for tree nodes whose seat has a
    // corresponding SessionRowData, we render that (title, navigate, tail);
    // for tree nodes with no matching session row (workers, mock seats), we
    // synthesize a minimal SessionRowData so LaneTile still renders honestly.
    const sessionBySeatId = React.useMemo(() => {
        const m = new Map<string, LaneRow>();
        for (const row of lanes) {
            if (row.seat) m.set(row.seat.seat, row);
        }
        return m;
    }, [lanes]);

    // The effective selected session id: an explicit board selection wins over
    // the (legacy) prop, so board tiles light in sync with the operator pane.
    const effectiveSelectedId = selection.selectedSessionId ?? selectedSessionId;

    const rowFor = (node: CongressTreeNode): LaneRow => (
        sessionBySeatId.get(node.seat.seat) ?? {
            session: synthesizeSessionRowFromSeat(node.seat),
            seat: node.seat,
        }
    );

    // Render one tile — the [TreeGutter, LaneTile] row plus (for a parent) the
    // collapse chip / collapsed-children preview. `localDepth` is the depth
    // used for the gutter rails: it restarts at 0 inside a cage frame so rails
    // never cross the teal border (CKP-11 invariant).
    const renderTile = (
        node: CongressTreeNode,
        localDepth: number,
        ancestorsContinue: boolean[],
        isLast: boolean,
        laneIndex: { i: number },
        out: React.ReactElement[],
    ): void => {
        const liveRow = sessionBySeatId.get(node.seat.seat);
        const row = rowFor(node);
        const isParent = node.children.length > 0;
        const isCollapsed = collapsed.has(node.seat.seat);

        out.push(
            <View key={`row:${node.seat.seat}`} style={styles.treeRow}>
                <TreeGutter depth={localDepth} ancestorsContinue={ancestorsContinue} isLast={isLast} />
                <View style={styles.treeTileCell}>
                    <LaneTile
                        row={row}
                        rosterUnreachable={rosterUnreachable}
                        selected={row.session.id === effectiveSelectedId}
                        // Tree-mode workers are already CHILDREN in the tree — the
                        // host+pedal fan-out is skipped for tree nodes. Fall back to
                        // the flat-mode fan-out ONLY for depth-0 roots with a live
                        // session row and no tree children.
                        workers={!isParent && liveRow ? (workersByLane.get(liveRow.session.id) ?? []) : []}
                        laneIndex={laneIndex.i}
                        depth={node.depth}
                        isParent={isParent}
                        boardMode={boardMode}
                        onSelect={() => selection.select(row.session.id, node.seat.seat)}
                    />
                    {isParent ? (
                        <View style={styles.collapseRow}>
                            <Pressable hitSlop={8} onPress={() => toggleCollapse(node.seat.seat)} style={styles.collapseChip}>
                                <Text style={[styles.collapseChipText, { fontSize: scaled(11, d.typeScale) }]}>
                                    {isCollapsed ? '▸' : '▾'} {node.children.length}
                                </Text>
                            </Pressable>
                            {isCollapsed ? (
                                // GRAFT 10 — a collapsed subtree shows a stacked row of
                                // its children's faces (max 6, +n), honest per-child
                                // dimming, square-if-sealed — so the human still sees
                                // WHO is hidden without expanding.
                                <View style={styles.collapsedPreview}>
                                    {node.children.slice(0, 6).map((child) => {
                                        const { verdict } = deriveLiveness(child.seat, rosterUnreachable);
                                        return (
                                            <Avatar
                                                key={`prev:${child.seat.seat}`}
                                                id={child.seat.seat}
                                                size={18}
                                                monochrome={isDimmed(verdict)}
                                                square={child.seat.cage_status === 'sealed'}
                                            />
                                        );
                                    })}
                                    {node.children.length > 6 ? (
                                        <Text style={[styles.collapsedMore, { fontSize: scaled(11, d.typeScale) }]}>
                                            +{node.children.length - 6}
                                        </Text>
                                    ) : null}
                                </View>
                            ) : null}
                        </View>
                    ) : null}
                </View>
            </View>,
        );
        laneIndex.i += 1;
    };

    // Normal (non-cage) subtree walk. renderTile renders a SINGLE node's tile;
    // the child recursion lives HERE, not inside renderTile — so the cage path
    // (renderInside) can reuse renderTile for one node without double-rendering
    // the subtree. (The dup-key bug: renderInside recursed into sealed children
    // AND renderTile recursed into all children, so every caged seat rendered
    // twice under the same `row:<seat>` key.)
    const renderSubtree = (
        node: CongressTreeNode,
        localDepth: number,
        ancestorsContinue: boolean[],
        isLast: boolean,
        laneIndex: { i: number },
        out: React.ReactElement[],
    ): void => {
        renderTile(node, localDepth, ancestorsContinue, isLast, laneIndex, out);
        const isParent = node.children.length > 0;
        const isCollapsed = collapsed.has(node.seat.seat);
        if (isParent && !isCollapsed) {
            const childCount = node.children.length;
            node.children.forEach((child, ci) => {
                const childIsLast = ci === childCount - 1;
                renderSubtree(
                    child,
                    localDepth + 1,
                    // Descending: this node's rail continues past a child row iff
                    // the child has a later sibling (childIndex < count - 1).
                    [...ancestorsContinue, !childIsLast],
                    childIsLast,
                    laneIndex,
                    out,
                );
            });
        }
    };

    // Recursive-tier render (2026-07-02, caged ai-ops design). Walks the tree
    // depth-first. Sealed subtrees are diverted into a CageGroup frame with
    // rails restarting at 0 inside the teal border (CKP-10/11); everything else
    // renders through the normal rail walk.
    const renderTreeNode = (node: CongressTreeNode, laneIndex: { i: number }, out: React.ReactElement[]): void => {
        const seat = node.seat;
        // CKP-10 — a sealed cage-root (this seat is sealed and its parent is NOT
        // sealed, or it's a forest root) opens a CageGroup frame; its sealed
        // descendants render inside it with rails restarting at 0.
        if (seat.cage_status === 'sealed') {
            renderCage(node, laneIndex, out);
            return;
        }
        renderSubtree(node, node.depth, [], node.depth === 0, laneIndex, out);
    };

    // Count the seats inside ONE cage — the frame's `N seats`. CKP-10: a frame
    // is keyed off `cage_id`, not tree-adjacency + `cage_status`. Only sealed
    // descendants sharing THIS cage's id are inside the frame; a differently-
    // caged sealed child is an escapee that opens its own sovereign frame and is
    // NOT counted here (counting it would misreport `SEALED · N seats` for a
    // frame that actually spans two distinct cages — a sovereignty
    // misrepresentation). `cageId` is the root's own `cage_id` (may be null in
    // the graft-8 broken-write case; a null-cage frame counts only null-cage
    // sealed seats, never swallowing a concrete-caged one).
    const countSealed = (node: CongressTreeNode, cageId: string | null): number => {
        let n = node.seat.cage_status === 'sealed' && node.seat.cage_id === cageId ? 1 : 0;
        for (const child of node.children) {
            if (child.seat.cage_status === 'sealed' && child.seat.cage_id === cageId) {
                n += countSealed(child, cageId);
            }
        }
        return n;
    };

    const renderCage = (root: CongressTreeNode, laneIndex: { i: number }, out: React.ReactElement[]): void => {
        // CKP-10 — the frame is keyed off THIS cage's id, not tree-adjacency +
        // cage_status. Only sealed descendants sharing `cageId` render inside;
        // anything else (uncaged, OR sealed-but-differently-caged) exits.
        const cageId = root.seat.cage_id;
        const inCage = (n: CongressTreeNode): boolean =>
            n.seat.cage_status === 'sealed' && n.seat.cage_id === cageId;
        const inner: React.ReactElement[] = [];
        // Render the sealed root + its same-cage sealed descendants inside the
        // frame, rails restarting at 0 (never crossing the teal border). A child
        // that is NOT same-cage-sealed — uncaged, or sealed in a DIFFERENT cage —
        // exits the frame and is dispatched as its own subtree below.
        const renderInside = (node: CongressTreeNode, localDepth: number, ancestorsContinue: boolean[], isLast: boolean): void => {
            renderTile(node, localDepth, ancestorsContinue, isLast, laneIndex, inner);
            const sealedChildren = node.children.filter(inCage);
            const count = sealedChildren.length;
            sealedChildren.forEach((child, ci) => {
                const childIsLast = ci === count - 1;
                renderInside(child, localDepth + 1, [...ancestorsContinue, !childIsLast], childIsLast);
            });
        };
        renderInside(root, 0, [], true);
        // Warden-dead: the cage-root's own honest verdict is 'dead'.
        const { verdict: rootVerdict } = deriveLiveness(root.seat, rosterUnreachable);
        out.push(
            <CageGroup
                key={`cage:${root.seat.seat}`}
                cageId={cageId}
                seatCount={countSealed(root, cageId)}
                wardenDead={rootVerdict === 'dead'}
            >
                {inner}
            </CageGroup>,
        );
        // Any child that ISN'T same-cage-sealed exits this frame and is
        // re-dispatched through renderTreeNode: an uncaged child renders as its
        // own subtree; a sealed-but-differently-caged child (a legitimate nested-
        // cage layout — cages are orthogonal to tree parentage) opens its OWN
        // sovereign frame. A cage never swallows a seat it doesn't own, and rails
        // never cross the border. We only recurse past children that STAY in this
        // cage; escapees are handed off whole to renderTreeNode (which re-enters
        // renderCage for a differently-caged sealed subtree).
        const walkForEscapees = (node: CongressTreeNode): void => {
            for (const child of node.children) {
                if (inCage(child)) {
                    walkForEscapees(child);
                } else {
                    renderTreeNode(child, laneIndex, out);
                }
            }
        };
        walkForEscapees(root);
    };

    // Decide which mode we're in:
    //   - mockRoster on -> tree mode, render only the tree.
    //   - mockRoster off + tree has real structure (any root has children) ->
    //     tree mode, render tree.
    //   - mockRoster off + tree is a flat forest (every node is a root, no
    //     children) -> fall back to the pre-tree flat renderer, which still
    //     carries the host+pedal worker fan-out for legacy rosters.
    const treeHasNesting = tree.roots.some((r) => r.children.length > 0);
    const useTreeMode = !!mockRoster || treeHasNesting;

    // GRAFT 5 — terminal-visible-by-default. On the first board-mode paint that
    // has lanes, auto-select the TOP lane into the operator pane. autoSelect is
    // a no-op after any explicit user select/clear this mount (the context
    // enforces that), so it never fights a real choice and never re-fires.
    const topLane: { sessionId: string; seatId: string | null } | null = React.useMemo(() => {
        if (useTreeMode) {
            const root = tree.roots[0];
            if (root) {
                const row = sessionBySeatId.get(root.seat.seat) ?? { session: synthesizeSessionRowFromSeat(root.seat), seat: root.seat };
                return { sessionId: row.session.id, seatId: root.seat.seat };
            }
            return null;
        }
        const first = lanes[0];
        return first ? { sessionId: first.session.id, seatId: first.seat?.seat ?? null } : null;
    }, [useTreeMode, tree.roots, sessionBySeatId, lanes]);

    React.useEffect(() => {
        if (boardMode && topLane) {
            selection.autoSelect(topLane.sessionId, topLane.seatId);
        }
    }, [boardMode, topLane, selection]);

    if (!data && !mockRoster) {
        // First paint, no data yet — quiet, never a fake board.
        return <View style={[styles.plane, { marginBottom: d.planeGap }]} />;
    }

    if (useTreeMode) {
        const treeLanes: React.ReactElement[] = [];
        const counter = { i: 0 };
        for (const root of tree.roots) {
            renderTreeNode(root, counter, treeLanes);
        }
        if (treeLanes.length === 0) {
            return (
                <View style={[styles.plane, { marginBottom: d.planeGap }]}>
                    <Text style={[styles.planeTitle, { fontSize: scaled(13, d.typeScale) }]}>THE WORK</Text>
                    <View style={styles.quietLineRow}>
                        <StatusDot color={GREY} size={6} />
                        <Text style={[styles.quietLine, { fontSize: scaled(13, d.typeScale) }]}>No active lanes — the board is empty</Text>
                    </View>
                </View>
            );
        }
        return (
            <View style={[styles.plane, { marginBottom: d.planeGap }]}>
                <View style={styles.planeTitleRow}>
                    <Text style={[styles.planeTitle, { fontSize: scaled(13, d.typeScale) }]}>THE WORK · {treeLanes.length}{mockRoster ? ' · MOCK' : ''}</Text>
                    {rosterUnreachable && !mockRoster ? (
                        <Text style={[styles.planeTitleWarn, { fontSize: scaled(11, d.typeScale) }]}>congress roster unreachable — showing last-known lanes</Text>
                    ) : null}
                    {tree.droppedCycleParents.length > 0 ? (
                        <Text style={[styles.planeTitleWarn, { fontSize: scaled(11, d.typeScale) }]}>
                            {tree.droppedCycleParents.length} cycle-breaking edge{tree.droppedCycleParents.length === 1 ? '' : 's'} dropped — see console
                        </Text>
                    ) : null}
                </View>
                {treeLanes}
            </View>
        );
    }

    // FLAT FALLBACK — the pre-tree renderer. Kept intact so a legacy flat
    // roster (every seat parent_seat_id === null, no nested structure) still
    // paints exactly as it did before this shift, including the host+pedal
    // worker fan-out (the closest linkage the old surface had).
    if (lanes.length === 0) {
        return (
            <View style={[styles.plane, { marginBottom: d.planeGap }]}>
                <Text style={[styles.planeTitle, { fontSize: scaled(13, d.typeScale) }]}>THE WORK</Text>
                <Text style={[styles.quietLine, { fontSize: scaled(13, d.typeScale) }]}>No active lanes — the board is empty</Text>
            </View>
        );
    }

    return (
        <View style={[styles.plane, { marginBottom: d.planeGap }]}>
            <View style={styles.planeTitleRow}>
                <Text style={[styles.planeTitle, { fontSize: scaled(13, d.typeScale) }]}>THE WORK · {lanes.length}</Text>
                {rosterUnreachable ? (
                    <Text style={[styles.planeTitleWarn, { fontSize: scaled(11, d.typeScale) }]}>congress roster unreachable — showing last-known lanes</Text>
                ) : null}
            </View>
            {lanes.map((row, i) => (
                <LaneTile
                    key={row.session.id}
                    row={row}
                    rosterUnreachable={rosterUnreachable}
                    selected={row.session.id === effectiveSelectedId}
                    workers={workersByLane.get(row.session.id) ?? []}
                    laneIndex={i}
                    depth={0}
                    boardMode={boardMode}
                    onSelect={() => selection.select(row.session.id, row.seat?.seat ?? null)}
                />
            ))}
            {ungroupedWorkers.length > 0 ? (
                <View style={styles.ungroupedWorkersBlock}>
                    <Text style={[styles.workerFanoutInferred, { fontSize: scaled(10, d.typeScale) }]}>
                        {ungroupedWorkers.length} worker{ungroupedWorkers.length === 1 ? '' : 's'} with no host+pedal match to a lane on screen — shown unassigned rather than guessed into a lane
                    </Text>
                    <View style={[styles.workerRoster, { gap: d.cardGap }]}>
                        {ungroupedWorkers.slice(0, WORKER_AVATAR_SHOWN).map((w, i) => (
                            <WorkerAvatar key={`${w.seat}-${i}`} worker={w} rosterUnreachable={rosterUnreachable} />
                        ))}
                        {ungroupedWorkers.length > WORKER_AVATAR_SHOWN ? (
                            <Text style={[styles.workerMore, { fontSize: scaled(12, d.typeScale) }]}>+{ungroupedWorkers.length - WORKER_AVATAR_SHOWN} more</Text>
                        ) : null}
                    </View>
                </View>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create((theme) => ({
    plane: {
        marginBottom: 24,
    },
    // CKP-11 — a tree row is [ gutter, tile-cell ]. The gutter draws the rails;
    // the cell holds the tile + its collapse chip.
    treeRow: {
        flexDirection: 'row',
        alignItems: 'stretch',
    },
    treeTileCell: {
        flex: 1,
        minWidth: 0,
    },
    collapseRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: -2,
        marginBottom: 6,
        marginLeft: 4,
    },
    collapseChip: {
        paddingVertical: 2,
        paddingHorizontal: 6,
    },
    collapseChipText: {
        color: theme.colors.textSecondary,
        ...Typography.default('semiBold'),
    },
    collapsedPreview: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    collapsedMore: {
        color: theme.colors.textSecondary,
        marginLeft: 2,
        ...Typography.default('semiBold'),
    },
    planeTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 10,
        marginLeft: 4,
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
    planeTitleWarn: {
        fontSize: 11,
        color: '#E5484D',
        flexShrink: 1,
        ...Typography.default(),
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
    workerMore: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        alignSelf: 'center',
        ...Typography.default('semiBold'),
    },
    ungroupedWorkersBlock: {
        marginTop: 4,
        marginBottom: 8,
        paddingVertical: 10,
        paddingHorizontal: 14,
        backgroundColor: theme.colors.surface,
        borderRadius: 12,
    },
}));
