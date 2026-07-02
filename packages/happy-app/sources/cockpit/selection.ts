import * as React from 'react';

// ============================================================================
// COCKPIT SELECTION (contract C1) — the single source of truth for "which lane
// is lit in the desktop operator pane." Lives in the shell (cockpit-v2.tsx);
// consumed by lane-identity (TheWorkPlane board tiles, header live-chip,
// RosterLedger) and lane-operator (OperatorPane × / Esc clear).
//
// Deck/phone never mount a provider — the no-op default here lets every
// consumer read/call the context unprovided without a crash (those postures
// keep today's inline tile-expand flow, no operator pane).
//
// autoSelect vs select (graft 5 semantics, enforced in the shell provider):
//   - select()     — an explicit user pick; always applies + marks userActed.
//   - autoSelect()  — the first-paint "terminal visible by default" convenience
//                     (top lane into the pane). Behaves as select ONLY if no
//                     user select/clear has happened this mount; otherwise it's
//                     a no-op, so it never fights a real user choice.
//   - clear()       — explicit clear (header chip press, pane ×, Esc); marks
//                     userActed so autoSelect stays quiet afterward, and drops
//                     Column B to the RosterLedger empty state.
// ============================================================================

export interface CockpitSelection {
    selectedSessionId: string | null;
    selectedSeatId: string | null;
    select(sessionId: string, seatId?: string | null): void;
    autoSelect(sessionId: string, seatId?: string | null): void;
    clear(): void;
}

export const CockpitSelectionContext = React.createContext<CockpitSelection>({
    selectedSessionId: null,
    selectedSeatId: null,
    select: () => {},
    autoSelect: () => {},
    clear: () => {},
});
