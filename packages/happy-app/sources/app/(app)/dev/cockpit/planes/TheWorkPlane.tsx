import * as React from 'react';
import { View } from 'react-native';
import { Text } from '@/components/StyledText';
import { StyleSheet } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { StatusDot } from '@/components/StatusDot';
import { useVisibleSessionListViewData } from '@/hooks/useVisibleSessionListViewData';
import { useCongressRoster } from '@/hooks/useCongressRoster';
import { useCongressTree, CongressTreeNode } from '@/hooks/useCongressTree';
import { CongressSeat } from '@/sync/congressTypes';
import { SessionRowData } from '@/sync/storage';
import { deriveLiveness } from '@/sync/liveness';
import { LaneTile, type LaneRow } from '../components/LaneTile';
import { WorkerAvatar, WORKER_AVATAR_SHOWN } from '../components/WorkerFanout';
import { GREY } from '../colors';
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

export function TheWorkPlane({ selectedSessionId, mockRoster }: {
    selectedSessionId?: string;
    // DEV-ONLY: when non-null, TheWorkPlane consumes the tree hydrated from
    // this fixture instead of the live congress roster. Wired to the "Mock
    // recursive roster" toggle at the top of CockpitV2. Never non-null on the
    // live surface (dev route only).
    mockRoster?: CongressSeat[] | null;
}) {
    const d = useDensity();
    const data = useVisibleSessionListViewData();
    const { sessions: roster, workers, unreachable: rosterUnreachable } = useCongressRoster();
    const tree = useCongressTree(mockRoster ?? null);

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

    // Recursive-tier render (2026-07-02, caged ai-ops design, vision check #6
    // sub-check 3). Walks the tree depth-first, emitting a LaneTile per node
    // with `depth` threaded through so the tile can indent + apply the nested
    // left-border. Empty roster surfaces the same quiet "no lanes" line the
    // flat renderer used — no fake board.
    const renderTreeNode = (node: CongressTreeNode, laneIndex: { i: number }, out: React.ReactElement[]): void => {
        const liveRow = sessionBySeatId.get(node.seat.seat);
        const row: LaneRow = liveRow ?? {
            session: synthesizeSessionRowFromSeat(node.seat),
            seat: node.seat,
        };
        out.push(
            <LaneTile
                key={`tree:${node.seat.seat}`}
                row={row}
                rosterUnreachable={rosterUnreachable}
                selected={row.session.id === selectedSessionId}
                // Tree-mode workers are already CHILDREN in the tree — the
                // host+pedal fan-out is skipped for tree nodes (children are
                // rendered as their own LaneTiles below). Fall back to the
                // flat-mode fan-out ONLY for depth-0 roots that DO have a
                // live session row and no tree children — the closest thing
                // to the pre-tree render.
                workers={node.children.length === 0 && liveRow ? (workersByLane.get(liveRow.session.id) ?? []) : []}
                laneIndex={laneIndex.i}
                depth={node.depth}
            />,
        );
        laneIndex.i += 1;
        for (const child of node.children) {
            renderTreeNode(child, laneIndex, out);
        }
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
                    selected={row.session.id === selectedSessionId}
                    workers={workersByLane.get(row.session.id) ?? []}
                    laneIndex={i}
                    depth={0}
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
