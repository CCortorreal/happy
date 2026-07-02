import type { LivenessVerdict } from '@/sync/liveness';

export const ACCENT_GATE = '#E5484D';
export const ACCENT_ROUTINE = '#9B7EDE';
export const GREEN = '#34C759';
export const AMBER = '#FF9500';
export const RED = '#E5484D';
export const GREY = '#8E8E93';

// CKP-10 sovereignty accent (2026-07-02, caged ai-ops NOC design). Teal is
// deliberately OUTSIDE the GREEN/AMBER/RED/GREY/purple state vocabulary — it
// speaks ENCLOSURE (a sealed cage), never health. A dead sealed seat is a RED
// dot inside a teal frame; the frame never recolors honest state. The only new
// color introduced by the NOC transformation.
export const ACCENT_CAGE = '#3BA0AE';
export const ACCENT_CAGE_TINT = 'rgba(59,160,174,0.08)';

// CKP-12 monochrome policy: identity drains to grey ONLY when the seat is
// confidently gone (dead) or its liveness can't be trusted (unverified).
// alive/idle/wedged keep their identity color — state lives in the dot, identity
// in the face. Typed against deriveLiveness's actual verdict union so a new
// verdict can't silently fall through to "colored".
export function isDimmed(verdict: LivenessVerdict): boolean {
    return verdict === 'dead' || verdict === 'unverified';
}
