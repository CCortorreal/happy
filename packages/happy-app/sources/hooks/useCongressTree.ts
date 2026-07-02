import * as React from 'react';
import { useCongressRoster } from '@/hooks/useCongressRoster';
import { CongressSeat, assertNoCycle } from '@/sync/congressTypes';

// useCongressTree — recursive-tier hydration (2026-07-02, caged ai-ops design,
// vision check #6). Reads the flat seat list off the existing seats-oracle
// roster (useCongressRoster is the sync surface), then hydrates it into a
// tree keyed by parent_seat_id.
//
// Backward-compat with the flat surface: every legacy seat parses with
// parent_seat_id === null (schema default), so a pre-recursive roster
// hydrates as a flat forest of depth-0 roots — the exact same shape the flat
// renderer painted. New seats that DO set parent_seat_id land as children.
//
// DEFENSIVE-SKIP cycle guard (not defensive-throw): the render must never
// crash on a corrupt roster (the seat graph is oracle-written, not client-
// written, and a bad write should surface loudly in the tree shape — a missing
// subtree — without taking the whole cockpit down). assertNoCycle is used as
// a probe here: if it throws for a candidate parent edge, we DROP that edge
// (log via console.warn) and treat the seat as a root. The cycle-participants
// still render (as roots, un-nested), so the human still sees them — the
// nesting is the only casualty.
//
// Roots-first API: consumers iterate roots and recurse into `.children`. Each
// node carries the SAME CongressSeat fields the flat surface exposed, plus a
// `children: TreeNode[]` and a depth-hint (`depth`, mirroring the seat's own
// cached depth from the schema — trust the writer per the schema block-comment,
// but the consumer can walk `children` for its own truth).

export interface CongressTreeNode {
    seat: CongressSeat;
    children: CongressTreeNode[];
    depth: number;
}

export interface CongressTree {
    roots: CongressTreeNode[];
    // Convenience: the same flat list this hook consumed, so callers that want
    // BOTH a tree and a flat list don't have to re-derive from useCongressRoster.
    allSeats: CongressSeat[];
    // LOUD-guard passthrough from useCongressRoster: an unreachable feed still
    // gets rendered honestly (empty tree + unreachable flag), never blank+quiet.
    unreachable: boolean;
    // Seats whose parent edge was dropped by the cycle-guard. Empty in the happy
    // path. Non-empty means the roster is corrupt and the consumer should either
    // surface a warning band or at least trust that the affected seats will
    // render as roots instead of vanishing.
    droppedCycleParents: string[];
}

const EMPTY_ROOTS: CongressTreeNode[] = [];
const EMPTY_SEATS: CongressSeat[] = [];
const EMPTY_DROPPED: string[] = [];

function hydrateTree(seats: CongressSeat[]): {
    roots: CongressTreeNode[];
    droppedCycleParents: string[];
} {
    if (seats.length === 0) {
        return { roots: EMPTY_ROOTS, droppedCycleParents: EMPTY_DROPPED };
    }

    // Build a defensive parent map: run assertNoCycle for every seat that
    // claims a parent; on throw, drop THAT seat's parent edge (treat it as a
    // root) and record it. The rest of the tree hydrates around the dropped
    // edge — nothing else is lost.
    const droppedCycleParents: string[] = [];
    const effectiveParent = new Map<string, string | null>();
    for (const s of seats) {
        const rawParent = s.parent_seat_id ?? null;
        if (rawParent === null) {
            effectiveParent.set(s.seat, null);
            continue;
        }
        try {
            assertNoCycle(s.seat, rawParent, seats);
            effectiveParent.set(s.seat, rawParent);
        } catch (err) {
            // Defensive-skip: don't crash the render — drop the edge, warn once
            // per bad seat, and let the seat render as an un-nested root.
            // eslint-disable-next-line no-console
            console.warn(
                `[useCongressTree] dropping parent edge for seat "${s.seat}" -> "${rawParent}": ${(err as Error).message}`,
            );
            droppedCycleParents.push(s.seat);
            effectiveParent.set(s.seat, null);
        }
    }

    // Build nodes keyed by seat id (the roster's `seat` field is the id).
    const nodes = new Map<string, CongressTreeNode>();
    for (const s of seats) {
        nodes.set(s.seat, { seat: s, children: [], depth: 0 });
    }

    // Wire children onto their parents; if a claimed parent doesn't exist in
    // the roster (orphan reference), treat the seat as a root — again, don't
    // vanish the node.
    const roots: CongressTreeNode[] = [];
    for (const s of seats) {
        const node = nodes.get(s.seat)!;
        const parentId = effectiveParent.get(s.seat) ?? null;
        if (parentId === null) {
            roots.push(node);
            continue;
        }
        const parent = nodes.get(parentId);
        if (!parent) {
            // Orphan parent reference — surface as a root rather than losing the seat.
            roots.push(node);
            continue;
        }
        parent.children.push(node);
    }

    // Compute depth by BFS from each root. This overrides the schema's cached
    // depth for the consumer's tree walk — safer than trusting a possibly-
    // stale writer cache after a re-parent. (The schema `depth` still exists
    // on `seat.depth` if a consumer wants it.)
    for (const root of roots) {
        const queue: CongressTreeNode[] = [root];
        root.depth = 0;
        while (queue.length > 0) {
            const n = queue.shift()!;
            for (const c of n.children) {
                c.depth = n.depth + 1;
                queue.push(c);
            }
        }
    }

    return { roots, droppedCycleParents };
}

/**
 * useCongressTree — reads the flat seat list from useCongressRoster and
 * hydrates it into a tree. See file-header comment for the design + defensive-
 * skip cycle-guard contract.
 *
 * @param overrideSeats — optional dev-only override. When provided, the hook
 * skips the live sync surface and hydrates the given seats directly (used by
 * cockpit-v2's "Mock recursive roster" toggle). Do not use in shipped surfaces.
 */
export function useCongressTree(overrideSeats?: CongressSeat[] | null): CongressTree {
    const live = useCongressRoster();

    return React.useMemo(() => {
        if (overrideSeats) {
            const { roots, droppedCycleParents } = hydrateTree(overrideSeats);
            return {
                roots,
                allSeats: overrideSeats,
                unreachable: false,
                droppedCycleParents,
            };
        }
        // Flatten the roster's two maps back into one seat list. The roster
        // dual-keys sessions (by claudeSid AND cuid) for the JOIN — we dedupe
        // by seat id before hydration so a session isn't inserted twice.
        const seen = new Set<string>();
        const seats: CongressSeat[] = [];
        for (const s of live.sessions.values()) {
            if (seen.has(s.seat)) continue;
            seen.add(s.seat);
            seats.push(s);
        }
        for (const s of live.workers) {
            if (seen.has(s.seat)) continue;
            seen.add(s.seat);
            seats.push(s);
        }
        if (seats.length === 0) {
            return {
                roots: EMPTY_ROOTS,
                allSeats: EMPTY_SEATS,
                unreachable: live.unreachable,
                droppedCycleParents: EMPTY_DROPPED,
            };
        }
        const { roots, droppedCycleParents } = hydrateTree(seats);
        return {
            roots,
            allSeats: seats,
            unreachable: live.unreachable,
            droppedCycleParents,
        };
    }, [live.sessions, live.workers, live.unreachable, overrideSeats]);
}

// ============================================================================
// DEV-ONLY MOCK FIXTURE — a hand-built recursive roster the cockpit-v2 dev
// route can flip on to demonstrate the nested-render code path when the live
// roster is still flat (no real seat has parent_seat_id set yet). NOT shipped
// to any live surface; the toggle lives in cockpit-v2.tsx only.
//
// Shape: one penthouse root, two floor-god children, each floor-god parents
// 1-2 workers — the tree the caged ai-ops design targets.
// ============================================================================

function mockSeat(overrides: Partial<CongressSeat> & { seat: string }): CongressSeat {
    const base: CongressSeat = {
        seat: overrides.seat,
        cuid: null,
        claudeSid: null,
        verdict: 'alive',
        kind: null,
        role: 'unknown',
        pedal: null,
        host: null,
        pid: null,
        model: null,
        warm: null,
        vramMB: null,
        currentWork: null,
        workStatus: null,
        startedAt: null,
        contextFill: null,
        health: null,
        bottleneck: null,
        lastAssistantText: null,
        lastTextTs: null,
        renderSafe: null,
        joinCollision: null,
        cardCounts: null,
        tailPreview: null,
        parent_seat_id: null,
        depth: 0,
        cage_status: 'uncaged',
        cage_id: null,
    };
    return { ...base, ...overrides };
}

export const MOCK_RECURSIVE_ROSTER: CongressSeat[] = [
    mockSeat({
        seat: 'penthouse-god',
        verdict: 'alive',
        role: 'penthouse',
        pedal: 'orchestrating the exit path',
        host: 'atlas-desk',
        parent_seat_id: null,
        depth: 0,
        currentWork: 'coordinating floor-gods',
    }),
    mockSeat({
        seat: 'floor-god-alpha',
        verdict: 'alive',
        role: 'floor-god',
        pedal: 'happy cockpit lane',
        host: 'atlas-desk',
        parent_seat_id: 'penthouse-god',
        depth: 1,
        currentWork: 'shipping the recursive-tier ripple',
    }),
    mockSeat({
        seat: 'floor-god-beta',
        verdict: 'wedged',
        role: 'floor-god',
        pedal: 'atlas VTT lane',
        host: 'atlas-desk',
        parent_seat_id: 'penthouse-god',
        depth: 1,
        currentWork: 'waiting on session review',
    }),
    mockSeat({
        seat: 'worker-alpha-1',
        verdict: 'alive',
        kind: 'worker',
        role: 'worker',
        pedal: 'happy cockpit lane',
        host: 'atlas-desk',
        model: 'sonnet-4-7',
        currentWork: 'typecheck sweep',
        parent_seat_id: 'floor-god-alpha',
        depth: 2,
    }),
    mockSeat({
        seat: 'worker-alpha-2',
        verdict: 'alive',
        kind: 'worker',
        role: 'worker',
        pedal: 'happy cockpit lane',
        host: 'atlas-desk',
        model: 'sonnet-4-7',
        currentWork: 'chrome dogfood',
        parent_seat_id: 'floor-god-alpha',
        depth: 2,
    }),
    mockSeat({
        seat: 'worker-beta-1',
        verdict: 'idle',
        kind: 'worker',
        role: 'worker',
        pedal: 'atlas VTT lane',
        host: 'atlas-desk',
        model: 'opus-4-7',
        currentWork: 'idle — waiting on scene review',
        parent_seat_id: 'floor-god-beta',
        depth: 2,
    }),
];
