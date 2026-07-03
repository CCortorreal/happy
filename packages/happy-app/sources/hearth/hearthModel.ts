import { LivenessVerdict } from '@/sync/liveness';
import { GREEN, AMBER, RED, GREY, ACCENT_GATE, ACCENT_ROUTINE, ACCENT_CAGE, isDimmed } from '@/cockpit/colors';

// ============================================================================
// HEARTH — the successor design pass (desk, Carlos-directed 2026-07-03).
//
// This is the presentational view-model for the Hearth phone stream. It is
// DELIBERATELY a thin, demo-fed mirror of the real sync layer, NOT a rewrite:
// each field is named to line up with the real substrate (a lane IS a Happy
// session; verdict is exactly deriveLiveness()'s output; the honest-state
// colours + isDimmed are imported from the REAL cockpit/colors, not re-guessed)
// so live-wiring later is a thin adapter — swap `demoHearth()` for a selector
// over the real store, keep every component. See docs/hearth-successor.md.
//
// Honesty-spine (#170): STATE lives in the dot colour; IDENTITY (the avatar)
// only drains to grey when confidently gone (dead) or untrustworthy
// (unverified). A not-fresh feed is NEVER a confident green. This module never
// invents a colour outside the GREEN/AMBER/RED/GREY vocabulary for state;
// ember is continuity, teal is enclosure, lilac is a routine ask — all three
// are OUTSIDE the health vocabulary on purpose.
// ============================================================================

// The one signature accent Hearth adds. Kept LOCAL (not a shared theme token)
// on purpose: promoting `ember` into theme.ts is loom's FEEL-lead call, not the
// desk's — this slice stays non-invasive to the shared theme. Ember reads on
// both light and dark, and never recolours health state.
export const EMBER = '#E8823A';
export const EMBER_BRIGHT = '#F0A063';
export const EMBER_TINT = 'rgba(232,130,58,0.13)';

export { GREEN, AMBER, RED, GREY, ACCENT_GATE, ACCENT_ROUTINE, ACCENT_CAGE, isDimmed };

export type LaneFlavor = 'claude' | 'codex' | 'gemini' | 'openclaw';

// A HearthLane mirrors { session, seat } collapsed to what the stream renders.
export interface HearthLane {
    id: string;                 // stable session id (claudeSid in the real join)
    name: string;               // seat / lane name, e.g. 'atlas'
    machine: string;            // host, e.g. 'bessie · 3090'
    verdict: LivenessVerdict;   // EXACTLY deriveLiveness().verdict
    blockedDownstream?: boolean; // alive-but-blocking-others -> amber dot (honest)
    thought: string;            // the distilled voiceThought() line
    contextPct: number;         // 0..100
    cost?: string;              // pre-formatted, e.g. '$4.12'
    flavor?: LaneFlavor;
    workers?: string[];         // fan-out worker names (proven tree)
    pulsing?: boolean;          // a genuinely turn-fresh beat (a pulse is a promise)
}

export type GateKind = 'gate' | 'routine';

// A HearthGate is a knock-card: something that wants a human decision now.
export interface HearthGate {
    id: string;
    seat: string;
    machine: string;
    kind: GateKind;
    ask: string;
    command?: string;           // the exact command, rendered in mono
    blocksDownstream?: number;  // count of tasks this unblocks
    destructive?: boolean;      // requires arm -> confirm
    modeChange?: string;        // e.g. 'switches aegis to Accept-Edits' (surfaced AT the tap)
}

export type VitalStatus = 'live' | 'binding' | 'dead';

export interface HearthVital {
    key: string;                // 'VRAM' | 'DISK' | 'CTX' | 'CAP'
    value: string;              // pre-formatted big value
    detail: string;             // sub-line when expanded
    pct: number | null;         // 0..1 bar fill, or null for no bar
    status: VitalStatus;
    warn?: boolean;
    redline?: boolean;          // >=90% -> red
}

export interface HearthThread {
    id: string;
    title: string;              // distilled next-move
    seat: string;
    machine?: string;
    age: string;                // honest relative age, or 'no turn on record'
    domain: string;             // 'Infra' | 'Atlas' | 'Methodology' | 'Finance'
    stale?: boolean;            // dead/unverified -> dimmed, never fake-fresh
    pedal?: boolean;            // the one pinned pedal thread
    verdict: LivenessVerdict;   // drives the spine colour honestly
}

export interface HearthResume {
    pedalLine: string;
    threadsOpen: number;
    lastTouch: string;
}

export interface HearthPulse {
    lanes: number;
    needYou: number;
    hot: number;
    capPct: number;
    fresh: boolean;             // pulse the ember dot only if genuinely turn-fresh
}

export interface HearthModel {
    resume: HearthResume;
    pulse: HearthPulse;
    gates: HearthGate[];
    lanes: HearthLane[];
    quietLanes: HearthLane[];
    vitals: HearthVital[];
    digest: string;
    threads: HearthThread[];
}

// ---------------------------------------------------------------------------
// The honest-state colour map — the SAME logic laneHonestState uses, so the
// dot never disagrees with the verdict. Exhaustive over LivenessVerdict.
// ---------------------------------------------------------------------------
export function laneDotColor(verdict: LivenessVerdict, blockedDownstream?: boolean): string {
    switch (verdict) {
        case 'unverified': return GREY;
        case 'dead':       return RED;
        case 'wedged':     return AMBER;
        case 'idle':       return GREY;
        case 'alive':      return blockedDownstream ? AMBER : GREEN;
        default:           return GREY;
    }
}

// A lane pulses only when it is genuinely alive AND turn-fresh (a promise of
// freshness), never for idle/dead/unverified.
export function lanePulses(lane: HearthLane): boolean {
    return lane.verdict === 'alive' && !lane.blockedDownstream && !!lane.pulsing;
}

export function contextPctColor(pct: number): string {
    if (pct >= 90) return RED;
    if (pct >= 75) return AMBER;
    return GREY;
}

// ---------------------------------------------------------------------------
// Demo fixtures — Carlos's real congress. Swap this one function for a store
// selector to go live; every component downstream is unchanged.
// ---------------------------------------------------------------------------
export function demoHearth(): HearthModel {
    return {
        resume: {
            pedalLine: 'Wiring the zero-LLM overseer conductor',
            threadsOpen: 3,
            lastTouch: '34m ago',
        },
        pulse: { lanes: 14, needYou: 2, hot: 1, capPct: 71, fresh: true },
        gates: [
            {
                id: 'g1',
                seat: 'aegis',
                machine: 'CarlosPC',
                kind: 'gate',
                ask: 'Approve a destructive command',
                command: 'rm -rf ./children/munder-fork-3',
                blocksDownstream: 2,
                destructive: true,
                modeChange: 'switches aegis to Accept-Edits',
            },
            {
                id: 'g2',
                seat: 'atlas',
                machine: 'bessie',
                kind: 'routine',
                ask: 'Proceed with the S2 obsidian rewrite plan?',
            },
        ],
        lanes: [
            // worst-first: uncertain / hot float up; calm greens collapse under the fold.
            {
                id: 'l-calliope', name: 'calliope', machine: 'deck', verdict: 'unverified',
                thought: "can't verify — deck offline", contextPct: 0,
            },
            {
                id: 'l-aiops', name: 'ai-ops', machine: 'CarlosPC', verdict: 'alive',
                thought: 'watching usage burn — cap resets Sun', contextPct: 88, cost: '$2.04',
                flavor: 'claude',
            },
            {
                id: 'l-chef', name: 'chef', machine: 'laptop', verdict: 'idle',
                thought: 'idle ~2h', contextPct: 0,
            },
            {
                id: 'l-overseer', name: 'overseer', machine: 'CarlosPC', verdict: 'alive',
                thought: 'routing knocks to /feed', contextPct: 41, cost: '$0.88',
                flavor: 'claude', pulsing: true,
            },
            {
                id: 'l-atlas', name: 'atlas', machine: 'bessie · 3090', verdict: 'alive',
                thought: 'generating sand-sea map tiles', contextPct: 22, cost: '$4.12',
                flavor: 'claude', pulsing: true, workers: ['tile-gen', 'obsidian-rewrite'],
            },
            {
                id: 'l-hestia', name: 'hestia', machine: 'CarlosPC', verdict: 'alive',
                thought: 'drafting family-resilience brief', contextPct: 55, cost: '$1.30',
                flavor: 'claude',
            },
        ],
        quietLanes: [
            {
                id: 'l-steward', name: 'steward', machine: 'CarlosPC', verdict: 'alive',
                thought: 'BT chain paydown — reconciled', contextPct: 18, flavor: 'claude',
            },
            {
                id: 'l-warden', name: 'warden', machine: 'CarlosPC', verdict: 'alive',
                thought: 'watching the stack — all green', contextPct: 12, flavor: 'claude',
            },
        ],
        vitals: [
            { key: 'VRAM', value: '62%', detail: '15.1 / 24 GB · RTX 3090', pct: 0.62, status: 'live', warn: true },
            { key: 'DISK', value: 'ok', detail: '41 / 500 GB free', pct: 0.41, status: 'live' },
            { key: 'CTX', value: 'calm', detail: 'all lanes calm · max 55%', pct: 0.3, status: 'live' },
            { key: 'CAP', value: '71%', detail: 'weekly cap · resets Sun 00:00', pct: 0.71, status: 'live', warn: true },
        ],
        digest: 'atlas shipped sand-sea-v5.png · overseer posted the fleet digest',
        threads: [
            {
                id: 't-pedal', title: 'Zero-LLM overseer conductor — next: wire the peer-channel enroll/set decouple',
                seat: 'overseer', machine: 'CarlosPC', age: '34m', domain: 'Infra', pedal: true, verdict: 'alive',
            },
            {
                id: 't-sec', title: 'Congress security posture — sandbox the unsandboxed congress',
                seat: 'aegis', machine: 'CarlosPC', age: '2h', domain: 'Infra', verdict: 'dead',
            },
            {
                id: 't-burn', title: 'AI-ops usage burn — solve before the weekly cap',
                seat: 'ai-ops', machine: 'CarlosPC', age: '20m', domain: 'Infra', verdict: 'alive',
            },
            {
                id: 't-atlas', title: 'S2 obsidian rewrite — the sand/sea boundary',
                seat: 'atlas', machine: 'bessie', age: '1h', domain: 'Atlas', verdict: 'alive',
            },
            {
                id: 't-fleet', title: 'The Fleet — meta-map of the Cairn armada',
                seat: 'shared', age: 'no turn on record', domain: 'Methodology', stale: true, verdict: 'unverified',
            },
            {
                id: 't-debt', title: 'Op Debt Null — BT chain paydown + 401k verification',
                seat: 'steward', age: '1d', domain: 'Finance', stale: true, verdict: 'idle',
            },
        ],
    };
}
