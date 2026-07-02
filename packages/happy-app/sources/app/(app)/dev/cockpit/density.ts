import * as React from 'react';

// ============================================================================
// POSTURE-ADAPTIVE DENSITY (Slice 3, spec §3 + §6.3). ONE component set renders
// at three densities — no per-device fork. `Density` selects a default
// altitude; every atom below reads it off `useDensity()` and adjusts spacing /
// type scale / expansion defaults, but the SAME tree renders in all three
// cases (no `if (density === 'phone') return <PhoneLaneTile/>` fork anywhere).
//
// Per spec §3:
//   - desktop (dense): multiple lanes visible, terminals expandable inline,
//     vitals a quiet footer row.
//   - deck (lean-back): between the two — larger touch targets,
//     controller-reachable, medium density.
//   - phone (compact): needs-you + one honest line per lane (tap to expand) +
//     a collapsed vitals dot-row.
// Capability is posture-INVARIANT: the phone tree is the same NeedsYouCard /
// LaneTile / VitalsStrip components, just denser defaults — consequential-
// confirm gates (the NEEDS-YOU reply controls) render identically at every
// density, never dropped on the small screen.
// ============================================================================

export type Density = 'desktop' | 'phone' | 'deck';

export interface DensityTokens {
    // Outer rhythm
    planeGap: number;
    cardGap: number;
    cardPaddingV: number;
    cardPaddingH: number;
    cardRadius: number;
    // Type scale (multiplier applied to each style's base fontSize below)
    typeScale: number;
    // Touch targets — deck is controller/couch-reachable, wants the biggest hit areas
    minTouchSize: number;
    // THE WORK plane: how many lanes get their tail auto-expanded on first
    // paint. Desktop shows work inline across several lanes at once (spec's
    // "multiple lanes visible at once, terminals expandable inline"); phone
    // and deck stay one-honest-line-per-lane until tapped.
    autoExpandLanes: number;
    // Lane tile identity/pressure sub-line — desktop has room to keep it
    // visible at all times; phone/deck still RENDER it (capability-invariant,
    // never removed) but at compact type scale rather than hidden.
    laneAvatarSize: number;
    workerAvatarSize: number;
    // VITALS: desktop/deck show the label + one-line summary text next to each
    // dot (a "footer row"); phone collapses to dot + label only, tap still
    // expands the same full gauge underneath — same data, less text.
    vitalsShowSummary: boolean;
}

const DENSITY_TOKENS: Record<Density, DensityTokens> = {
    desktop: {
        planeGap: 24,
        cardGap: 8,
        cardPaddingV: 12,
        cardPaddingH: 14,
        cardRadius: 12,
        typeScale: 1,
        minTouchSize: 32,
        // Desktop inline-expands the top lane by default — "terminals expandable
        // inline" density (spec §3). Still just a DEFAULT: every lane's chevron
        // still toggles independently at every posture.
        autoExpandLanes: 1,
        laneAvatarSize: 40,
        workerAvatarSize: 26,
        vitalsShowSummary: true,
    },
    deck: {
        // Lean-back: between desktop and phone. Bigger touch targets
        // (controller/couch-reachable), a bit more breathing room, but still
        // shows summaries — a couch isn't a glance-and-approve context.
        planeGap: 28,
        cardGap: 12,
        cardPaddingV: 16,
        cardPaddingH: 18,
        cardRadius: 14,
        typeScale: 1.12,
        minTouchSize: 44,
        autoExpandLanes: 0,
        laneAvatarSize: 48,
        workerAvatarSize: 32,
        vitalsShowSummary: true,
    },
    phone: {
        // Compact: one honest line per lane, tap to expand. Vitals collapse to
        // a dot-row. Touch targets stay generous (thumb-reachable), even
        // though the surrounding chrome is the most compact of the three.
        planeGap: 18,
        cardGap: 6,
        cardPaddingV: 10,
        cardPaddingH: 12,
        cardRadius: 10,
        typeScale: 0.92,
        minTouchSize: 44,
        autoExpandLanes: 0,
        laneAvatarSize: 34,
        workerAvatarSize: 22,
        vitalsShowSummary: false,
    },
};

export const DensityContext = React.createContext<Density>('desktop');

export function useDensity(): DensityTokens & { density: Density } {
    const density = React.useContext(DensityContext);
    return { ...DENSITY_TOKENS[density], density };
}

// Scales a base fontSize by the active density's type scale — the ONE place
// every atom below reads to stay a single component set instead of forking
// per-posture text styles.
export function scaled(base: number, typeScale: number): number {
    return Math.round(base * typeScale);
}
