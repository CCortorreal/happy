import * as React from 'react';
import { View, TextInput, Pressable, ScrollView, LayoutAnimation } from 'react-native';
import { Text } from '@/components/StyledText';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { layout } from '@/components/layout';
import { Avatar } from '@/components/Avatar';
import { StatusDot } from '@/components/StatusDot';
import { useWarden } from '@/hooks/useWarden';
import { WardenItem } from '@/sync/wardenTypes';
import { answerWarden } from '@/sync/apiWarden';
import { TokenStorage } from '@/auth/tokenStorage';
import { useAuth } from '@/auth/AuthContext';
import { FeedUnreachable } from '@/components/HonestSignal';
import { useVisibleSessionListViewData } from '@/hooks/useVisibleSessionListViewData';
import { useCongressRoster } from '@/hooks/useCongressRoster';
import { useCongressTree, CongressTreeNode, MOCK_RECURSIVE_ROSTER } from '@/hooks/useCongressTree';
import { useNavigateToSession } from '@/hooks/useNavigateToSession';
import { useLaneTail } from '@/hooks/useLaneTail';
import { sync } from '@/sync/sync';
import { storage } from '@/sync/storage';
import { sessionAbort } from '@/sync/ops';
import { CongressSeat } from '@/sync/congressTypes';
import { SessionRowData } from '@/sync/storage';
import { useLocalSetting } from '@/sync/storage';
import { deriveLiveness } from '@/sync/liveness';
import { congressIdentity } from '@/utils/congressIdentity';
import { congressHealthStatus, voiceThought, contextPressure } from '@/components/SessionsList';
import { useVram } from '@/hooks/useVram';
import { useDisk } from '@/hooks/useDisk';
import { useHeartbeat } from '@/hooks/useHeartbeat';
import { useBacklog } from '@/hooks/useBacklog';
import { useCongressKanban } from '@/hooks/useCongressKanban';
import { useCongressRelay } from '@/hooks/useCongressRelay';
import { CongressKanbanCounts } from '@/sync/congressKanbanTypes';
import { CongressRelayItem } from '@/sync/congressRelayTypes';
import { VramGauge } from '@/components/VramGauge';
import { DiskGauge } from '@/components/DiskGauge';
import { ContextGauge } from '@/components/ContextGauge';
import { BacklogGauge } from '@/components/BacklogGauge';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

// Cockpit v2 — the WORK-FIRST reframe (July-7 spec, §6.1 Slice 1). DEV ROUTE, not
// wired into Carlos's live surface (SessionsList.tsx stays untouched). Same for-carlos
// / roster / gauge feeds, but the SPINE inverts: three planes, top to bottom —
//   1. NEEDS-YOU  — the interrupt (warden knock-cards). Boring-when-healthy: a thin
//      quiet line, never an empty labeled box.
//   2. THE WORK   — the living center + DEFAULT focus. Per-lane tile: work-object
//      thought-line (never a bare gerund), honest state (fail-honest, derived from a
//      fresh probe — never a hard green), room for a live tail on expand.
//   3. VITALS     — Vram/Disk/Context/Heartbeat/Backlog collapsed into ONE compact
//      dot-row, boring-when-healthy, tap-to-expand to the full gauge. A dead feed
//      reads LOUD (red dot) — never a calm lie.
//
// §0 honesty-spine everywhere: three-state RENDER/QUIET/LOUD, honest-null, no
// hard-coded green. Reuses the SAME derivation SessionsList.tsx uses (congressHealthStatus/
// voiceThought/contextPressure are now exported from there for exactly this reuse — no
// forked copy of the honest-state logic). Dev page → i18n-exempt.
//
// Slice 2 (the trust-debt floor, spec §5) closed IN THIS FILE:
//   - G10/G14: laneHonestState's plain-session fallback painted an idle-but-connected
//     ('waiting') lane the SAME green as an actively-working one — fixed to GREY, same
//     as every other idle read (deriveLiveness's 'idle' verdict, disconnected, etc.).
//   - G11: the identity sub-line silently fell back to a raw cwd-path fragment when a
//     session had no congress seat to reconcile a role against. Now says so honestly
//     ("no seat role — not a congress lane") instead of quietly presenting a path
//     fragment as if it were an identity — the exact confusion that cost a live-overseer
//     archive. (The primary title row, session.name, was already role/summary-derived,
//     never cwd — verified via getSessionName in sessionUtils.ts.)
//   - G13: verified, not re-fixed here — useHonestFeed.ts (shared, already reused by
//     every feed this file polls) already races each poll against a 4s timeout
//     (POLL_TIMEOUT_MS) with unreachableAfter=3, so a HUNG backend surfaces LOUD within
//     ~12s. True per-poll AbortController cancellation of the underlying fetch (vs. just
//     racing/ignoring it) would require threading a signal through every apiXxx.ts
//     fetcher + the shared `backoff()` retry wrapper in utils/time.ts — out of this
//     dev-route lane's scope since those are shared by the live surface too; flagged,
//     not silently skipped.
//   - G17/G18: VitalsStrip's dot collapsed "no successful read yet" (first paint / a
//     boot still binding) and "confirmed dead after a good read" into the same alarm
//     red. Split into BINDING (grey, "reading…") vs DEAD (red) vs DEGRADED (amber) vs
//     healthy (green) — never a calm green over an unknown, never the same red for
//     "still starting up" as for "confirmed gone."
//   - G20: gauge/vitals reserved heights were already in place (VramGauge/DiskGauge/
//     ContextGauge/BacklogGauge minHeight + FeedUnreachable's minHeight prop, laneTile's
//     minHeight: 64) from the shared-hook work that predates this dev route; verified
//     still wired correctly, not re-done.

const ACCENT_GATE = '#E5484D';
const ACCENT_ROUTINE = '#9B7EDE';
const GREEN = '#34C759';
const AMBER = '#FF9500';
const RED = '#E5484D';
const GREY = '#8E8E93';

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

interface DensityTokens {
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

const DensityContext = React.createContext<Density>('desktop');

function useDensity(): DensityTokens & { density: Density } {
    const density = React.useContext(DensityContext);
    return { ...DENSITY_TOKENS[density], density };
}

// Scales a base fontSize by the active density's type scale — the ONE place
// every atom below reads to stay a single component set instead of forking
// per-posture text styles.
function scaled(base: number, typeScale: number): number {
    return Math.round(base * typeScale);
}

// ============================================================================
// PLANE 1 — NEEDS-YOU (the interrupt). Same predicate the WardenKnocks view uses
// (open = no answer, not withdrawn) so a lane's gate agrees everywhere it renders.
// ============================================================================

const isWithdrawn = (i: WardenItem) => !!i.withdrawn_ts;
const isAnswered = (i: WardenItem) => !!i.a;
const waitsOnHuman = (i: WardenItem) => !isAnswered(i) && !isWithdrawn(i);

function blockingCount(card: WardenItem, all: WardenItem[]): number {
    return all.filter((other) => other.id !== card.id && (other.dependsOn ?? []).includes(card.id) && waitsOnHuman(other)).length;
}

function firstLine(q: string): string {
    const lines = (q ?? '').trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return lines[0] ?? (q ?? '').trim();
}

function NeedsYouCard({ item, all, optimistic, errored, onAnswer, onReauth }: {
    item: WardenItem;
    all: WardenItem[];
    optimistic?: string;
    errored?: 'auth' | 'send';
    onAnswer: (id: string, text: string) => void;
    onReauth: () => void;
}) {
    const { theme } = useUnistyles();
    const d = useDensity();
    const [draft, setDraft] = React.useState('');
    const isGate = (item.kind ?? '').toLowerCase() === 'gate';
    const accent = isGate ? ACCENT_GATE : ACCENT_ROUTINE;
    const settledAnswer = item.a ?? optimistic ?? null;
    const settled = !!settledAnswer;
    const blocking = blockingCount(item, all);

    const submit = (text: string) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        onAnswer(item.id, trimmed);
    };

    // Consequential-confirm gate (§0 bright line): the reply controls below are
    // rendered IDENTICALLY at every density — never dropped or stubbed on the
    // small screen, only their spacing/type scale changes via `d`.
    return (
        <View style={[
            styles.needsYouCard,
            { borderLeftColor: settled ? GREEN : accent, borderRadius: d.cardRadius, paddingVertical: d.cardPaddingV, paddingHorizontal: d.cardPaddingH, marginBottom: d.cardGap },
            settled && styles.needsYouCardSettled,
        ]}>
            <View style={styles.headerRow}>
                <Text style={[styles.sender, { fontSize: scaled(12, d.typeScale) }]} numberOfLines={1}>{item.from}</Text>
                <View style={[styles.kindChip, { backgroundColor: settled ? GREEN : accent }]}>
                    <Text style={styles.kindChipText}>{isGate ? 'GATE' : 'ROUTINE'}</Text>
                </View>
            </View>

            <Text style={[styles.ask, { fontSize: scaled(15, d.typeScale) }]} numberOfLines={settled ? 2 : 4}>{firstLine(item.q)}</Text>

            {blocking > 0 && !settled ? (
                <Text style={[styles.cascade, { fontSize: scaled(12, d.typeScale) }]}>⛒ blocking {blocking} downstream {blocking === 1 ? 'task' : 'tasks'}</Text>
            ) : null}

            {settled ? (
                <Text style={[styles.ack, { fontSize: scaled(13, d.typeScale) }]}>✓ Got it — sent to {item.from}</Text>
            ) : (
                <View style={styles.replyArea}>
                    <TextInput
                        style={[styles.input, { fontSize: scaled(14, d.typeScale), minHeight: d.minTouchSize }]}
                        value={draft}
                        onChangeText={setDraft}
                        placeholder="write back…"
                        placeholderTextColor={theme.colors.textSecondary}
                        onSubmitEditing={() => submit(draft)}
                        returnKeyType="send"
                        blurOnSubmit={false}
                    />
                    <View style={styles.replyButtons}>
                        <Pressable style={[styles.btn, styles.btnAffirm, { minHeight: d.minTouchSize }]} onPress={() => submit(draft.trim() ? `Go ahead — ${draft.trim()}` : 'Go ahead')}>
                            <Text style={[styles.btnAffirmText, { fontSize: scaled(13, d.typeScale) }]}>Respond &amp; unblock</Text>
                        </Pressable>
                        <Pressable style={[styles.btn, styles.btnDecline, { minHeight: d.minTouchSize }]} onPress={() => submit('Not now')}>
                            <Text style={[styles.btnDeclineText, { fontSize: scaled(13, d.typeScale) }]}>Not now</Text>
                        </Pressable>
                    </View>

                    {errored === 'auth' ? (
                        <Pressable onPress={onReauth} hitSlop={6}>
                            <Text style={styles.reauthLink}>Session expired — sign in again to send</Text>
                        </Pressable>
                    ) : errored ? (
                        <Text style={styles.errorLine}>Couldn't send — retry</Text>
                    ) : null}
                </View>
            )}
        </View>
    );
}

function NeedsYouPlane() {
    const d = useDensity();
    const { items, unreachable } = useWarden();
    const { logout } = useAuth();
    const [overlay, setOverlay] = React.useState<Record<string, string>>({});
    const [errors, setErrors] = React.useState<Record<string, 'auth' | 'send'>>({});

    const onAnswer = React.useCallback(async (id: string, text: string) => {
        setOverlay((o) => ({ ...o, [id]: text }));
        setErrors((e) => { const n = { ...e }; delete n[id]; return n; });
        const creds = await TokenStorage.getCredentials();
        const res = creds ? await answerWarden(creds, id, text) : { ok: false, authExpired: false };
        if (!res.ok) {
            setOverlay((o) => { const n = { ...o }; delete n[id]; return n; });
            setErrors((e) => ({ ...e, [id]: res.authExpired ? 'auth' : 'send' }));
        }
    }, []);

    const needsYou = React.useMemo(() => {
        const visible = items.filter((i) => waitsOnHuman(i) || overlay[i.id]);
        return visible.slice().sort((a, b) => {
            const ab = blockingCount(a, items);
            const bb = blockingCount(b, items);
            if (ab !== bb) return bb - ab;
            return (a.ts ?? '').localeCompare(b.ts ?? '');
        });
    }, [items, overlay]);

    const openCount = needsYou.filter((i) => !overlay[i.id]).length;

    // Boring-when-healthy: nothing needs Carlos -> a thin quiet line, NEVER an empty
    // labeled box. A dead feed with nothing to show is the one exception — LOUD (styled
    // louder via a destructive-tinted card, never softened toward calm).
    if (needsYou.length === 0) {
        if (unreachable) {
            return (
                <View style={[styles.plane, { marginBottom: d.planeGap }]}>
                    <View style={[styles.unreachableCard, { borderRadius: d.cardRadius, paddingVertical: d.cardPaddingV, paddingHorizontal: d.cardPaddingH }]}>
                        <FeedUnreachable message="can't reach the Warden — answers won't send" />
                    </View>
                </View>
            );
        }
        return (
            <View style={[styles.plane, { marginBottom: d.planeGap }]}>
                <View style={styles.quietLineRow}>
                    <StatusDot color={GREY} size={6} />
                    <Text style={[styles.quietLine, { fontSize: scaled(13, d.typeScale) }]}>Nothing needs you right now</Text>
                </View>
            </View>
        );
    }

    return (
        <View style={[styles.plane, { marginBottom: d.planeGap }]}>
            <Text style={[styles.planeTitle, { fontSize: scaled(13, d.typeScale) }]}>NEEDS YOU{openCount > 0 ? ` · ${openCount}` : ''}</Text>
            {needsYou.map((item) => (
                <NeedsYouCard
                    key={item.id}
                    item={item}
                    all={items}
                    optimistic={overlay[item.id]}
                    errored={errors[item.id]}
                    onAnswer={onAnswer}
                    onReauth={logout}
                />
            ))}
        </View>
    );
}

// ============================================================================
// PLANE 2 — THE WORK (the living center, default focus). One tile per active
// lane/session. Honest state is DERIVED from the same fresh-probe machinery the
// live surface uses (deriveLiveness + congressHealthStatus) — never a hard green.
// The thought-line reuses voiceThought (banned-gerund rule already enforced there:
// R1 distills a specific clause, never a bare "building"/"overseeing").
// ============================================================================

type LaneRow = { session: SessionRowData; seat: CongressSeat | undefined };

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

const WORKER_AVATAR_SHOWN = 8;

// One worker avatar — mirrors FloorTile's roster button: face + a small status
// dot, honest per-worker state via the SAME deriveLiveness the lane dot uses
// (never a separate hard-coded green for workers).
function WorkerAvatar({ worker, rosterUnreachable }: { worker: CongressSeat; rosterUnreachable: boolean }) {
    const d = useDensity();
    const { verdict } = deriveLiveness(worker, rosterUnreachable);
    const color = verdict === 'alive' ? GREEN : verdict === 'wedged' ? AMBER : verdict === 'dead' ? RED : GREY;
    const label = worker.currentWork?.trim() || worker.model?.trim() || worker.role?.trim() || worker.seat;
    return (
        <View style={[styles.workerAvatarWrap, { width: d.workerAvatarSize + 26 }]}>
            <Avatar id={worker.seat} size={d.workerAvatarSize} monochrome={verdict !== 'alive'} />
            <StatusDot color={color} isPulsing={verdict === 'alive'} size={7} style={styles.workerDot} />
            <Text style={[styles.workerLabel, { fontSize: scaled(9.5, d.typeScale) }]} numberOfLines={1}>{label}</Text>
        </View>
    );
}

// The worker roster strip under a god lane — up to WORKER_AVATAR_SHOWN shown,
// '+N more' beyond that (the munder FloorTile pattern). `inferred` marks a
// group whose linkage came from the host+pedal fallback signal (always true
// today — there is no stronger linkage field yet) so the UI never claims a
// hierarchy stronger than what was actually derived.
function WorkerFanout({ workers, rosterUnreachable, inferred }: {
    workers: CongressSeat[];
    rosterUnreachable: boolean;
    inferred: boolean;
}) {
    const d = useDensity();
    if (workers.length === 0) return null;
    const shown = workers.slice(0, WORKER_AVATAR_SHOWN);
    const overflow = workers.length - shown.length;
    return (
        <View style={styles.workerFanout}>
            <View style={styles.workerFanoutHeaderRow}>
                <Text style={[styles.workerFanoutTitle, { fontSize: scaled(11, d.typeScale) }]}>
                    workers · {workers.length}
                </Text>
                {inferred ? (
                    <Text style={[styles.workerFanoutInferred, { fontSize: scaled(10, d.typeScale) }]}>grouped by host+pedal — inferred, not a proven link</Text>
                ) : null}
            </View>
            <View style={[styles.workerRoster, { gap: d.cardGap }]}>
                {shown.map((w, i) => (
                    <WorkerAvatar key={`${w.seat}-${i}`} worker={w} rosterUnreachable={rosterUnreachable} />
                ))}
                {overflow > 0 ? <Text style={[styles.workerMore, { fontSize: scaled(12, d.typeScale) }]}>+{overflow} more</Text> : null}
            </View>
        </View>
    );
}

// Fail-honest state mapped onto the four-state vocabulary the spec names —
// idle / working / blocked / done — derived from the SAME reconciled liveness +
// health verdict the live tile paints, never a separate hard-coded read.
function laneHonestState(seat: CongressSeat | undefined, rosterUnreachable: boolean, session: SessionRowData): {
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

// Recursive-tier indent width per depth level (2026-07-02, caged ai-ops design,
// vision check #6 sub-check 3). Nested lanes get a `depth * INDENT_PX` left
// margin PLUS a subtle left border to make the nesting glanceable — the same
// pattern the munder building's FloorTile hierarchy uses.
const NESTED_INDENT_PX = 28;

// KANBAN CHIPS (mission A3, work-state grid). Building-style compact counts:
// blocked reads amber (the one state that needs attention), done reads muted
// (past-tense, not a call to action), todo/doing read neutral text. Density-
// aware sizing via the caller's scaled() calls. Absent data (undefined, or
// every count null) renders NOTHING — honest omission per the mission spec,
// never zeros-as-real (a lane with a real 0 todo would need the oracle to
// have actually said so, which cardCounts' honest-null discipline already
// guards upstream in congressKanbanTypes.ts/apiCongressKanban.ts).
function KanbanChips({ counts, typeScale }: { counts: CongressKanbanCounts | undefined; typeScale: number }) {
    if (!counts) return null;
    const chips: { key: string; label: string; value: number; color: string }[] = [];
    if (counts.todo != null && counts.todo > 0) chips.push({ key: 'todo', label: 'todo', value: counts.todo, color: GREY });
    if (counts.doing != null && counts.doing > 0) chips.push({ key: 'doing', label: 'doing', value: counts.doing, color: GREEN });
    if (counts.blocked != null && counts.blocked > 0) chips.push({ key: 'blocked', label: 'blocked', value: counts.blocked, color: AMBER });
    if (counts.done != null && counts.done > 0) chips.push({ key: 'done', label: 'done', value: counts.done, color: GREY });
    if (chips.length === 0) return null;
    return (
        <View style={styles.kanbanChipsRow}>
            {chips.map((c) => (
                <View key={c.key} style={[styles.kanbanChip, c.key === 'blocked' && styles.kanbanChipBlocked]}>
                    <Text style={[styles.kanbanChipText, { color: c.color, fontSize: scaled(10.5, typeScale) }, c.key === 'done' && styles.kanbanChipTextMuted]}>
                        {c.value} {c.label}
                    </Text>
                </View>
            ))}
        </View>
    );
}

// ----------------------------------------------------------------------------
// LANE HANDS (Mission A1) — steer + gated halt on the expanded tile. The
// cockpit gets hands, mirroring the building's control register:
//   STEER — injects context into the lane's underlying session via the EXACT
//     send path the session chat screen uses (sync.sendMessage source:'chat',
//     see SessionView.tsx handleSend) — no new transport, no keystroke
//     simulation. The ack is honest: an optimistic "steered ·" chip (we sent
//     it, nothing more claimed) and then the live tail itself shows the
//     effect. A send that throws reads LOUD ("steer failed"), never quiet.
//   HALT — wired to Happy's existing abort primitive (sessionAbort in
//     sync/ops.ts — the same sessionRPC 'abort' the chat screen's stop button
//     fires, including the resetSessionAgentOverrides it does first). Two-
//     step: tap arms (destructive-red "confirm halt"), second tap within 5s
//     executes, else disarms. "halt sent" is the strongest claim made — the
//     lane's own honest state shows whether it actually stopped.
// Density-aware via the same tokens every atom here reads (minTouchSize /
// typeScale): desktop inline, phone compact-but-present, deck big targets.
// Renders ONLY behind the renderSafe gate (a privacy-gated seat is not
// steerable from this surface) and only for a REAL session row — a SYNTH:
// seat-only row has no conversable session, which LaneTile says honestly
// instead of painting a dead input.
function LaneHands({ sessionId }: { sessionId: string }) {
    const { theme } = useUnistyles();
    const d = useDensity();
    const [draft, setDraft] = React.useState('');
    const [steerState, setSteerState] = React.useState<'idle' | 'steered' | 'failed'>('idle');
    const [haltArmed, setHaltArmed] = React.useState(false);
    const [haltState, setHaltState] = React.useState<'idle' | 'sent' | 'failed'>('idle');
    const steerChipTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const disarmTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    React.useEffect(() => () => {
        if (steerChipTimer.current) clearTimeout(steerChipTimer.current);
        if (disarmTimer.current) clearTimeout(disarmTimer.current);
    }, []);

    const submitSteer = React.useCallback(async () => {
        const text = draft.trim();
        if (!text) return;
        setDraft('');
        // Optimistic chip — "steered ·" claims only that the send was fired;
        // the live tail above is the real evidence of effect (no fake ack).
        setSteerState('steered');
        if (steerChipTimer.current) clearTimeout(steerChipTimer.current);
        steerChipTimer.current = setTimeout(() => setSteerState('idle'), 8000);
        try {
            await sync.sendMessage(sessionId, text, { source: 'chat' });
        } catch {
            if (steerChipTimer.current) clearTimeout(steerChipTimer.current);
            setSteerState('failed');
        }
    }, [draft, sessionId]);

    const onHaltPress = React.useCallback(() => {
        if (!haltArmed) {
            // Step 1: ARM. Disarms itself after 5s if not confirmed.
            setHaltArmed(true);
            if (disarmTimer.current) clearTimeout(disarmTimer.current);
            disarmTimer.current = setTimeout(() => setHaltArmed(false), 5000);
            return;
        }
        // Step 2: CONFIRM — the exact chat-screen abort path (SessionView's
        // handleAbort): reset agent overrides, then the sessionRPC 'abort'.
        if (disarmTimer.current) clearTimeout(disarmTimer.current);
        setHaltArmed(false);
        setHaltState('sent');
        storage.getState().resetSessionAgentOverrides(sessionId);
        sessionAbort(sessionId).catch(() => setHaltState('failed'));
    }, [haltArmed, sessionId]);

    return (
        <View style={styles.laneHands}>
            <View style={[styles.laneHandsRow, { gap: Math.max(6, Math.round(d.cardGap * 0.8)) }]}>
                <TextInput
                    style={[
                        styles.laneHandsInput,
                        { fontSize: scaled(13, d.typeScale), minHeight: d.minTouchSize },
                    ]}
                    value={draft}
                    onChangeText={setDraft}
                    placeholder="steer — inject context, no keystrokes"
                    placeholderTextColor={theme.colors.textSecondary}
                    onSubmitEditing={submitSteer}
                    returnKeyType="send"
                    blurOnSubmit={false}
                />
                <Pressable
                    onPress={onHaltPress}
                    style={[
                        styles.laneHandsHalt,
                        { minHeight: d.minTouchSize, minWidth: Math.max(d.minTouchSize, 64) },
                        haltArmed && styles.laneHandsHaltArmed,
                    ]}
                >
                    <Text style={[
                        styles.laneHandsHaltText,
                        { fontSize: scaled(12, d.typeScale) },
                        haltArmed && styles.laneHandsHaltTextArmed,
                    ]}>
                        {haltArmed ? 'confirm halt' : 'halt'}
                    </Text>
                </Pressable>
            </View>
            {steerState === 'steered' ? (
                <Text style={[styles.laneHandsChip, { fontSize: scaled(11, d.typeScale) }]}>steered ·</Text>
            ) : steerState === 'failed' ? (
                <Text style={[styles.laneHandsChipFailed, { fontSize: scaled(11, d.typeScale) }]}>steer failed — didn't reach the lane</Text>
            ) : null}
            {haltState === 'sent' ? (
                <Text style={[styles.laneHandsChip, { fontSize: scaled(11, d.typeScale) }]}>halt sent — watch the lane state</Text>
            ) : haltState === 'failed' ? (
                <Text style={[styles.laneHandsChipFailed, { fontSize: scaled(11, d.typeScale) }]}>halt failed — lane didn't take the abort</Text>
            ) : null}
        </View>
    );
}

function LaneTile({ row, rosterUnreachable, selected, workers, laneIndex, depth, kanban }: {
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
    // a parent seat. Drives left-indent + a subtle left border for glanceable
    // nesting. Backward-compat: existing flat-list callers pass 0 (or omit if
    // TypeScript allows) and get the identical un-indented render.
    depth: number;
    // Mission A3: this lane's kanban counts keyed by its seat id (undefined
    // when the lane has no congress seat, or the seat isn't in the kanban
    // feed's map — both render as absent chips, never zeros).
    kanban: CongressKanbanCounts | undefined;
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

    // The work-object thought-line: never a bare gerund. voiceThought already distills
    // a specific clause (R1) or an honest idle/quiet fallback (R2/R4) — a plain session
    // with no seat just gets its subtitle (the best honest signal this data layer has).
    const workLine = thought?.text ?? session.subtitle ?? 'no work-object signal yet';

    // Desktop auto-expands this lane's tail inline (spec §3 "terminals expandable
    // inline" — dense multi-lane view); phone/deck stay collapsed to one honest
    // line until tapped. This is a DEFAULT only — `expanded` still toggles the
    // SAME state on every density, so a phone user can still tap to see the
    // tail; it's just off by default where screen space is scarcest.
    const effectiveExpanded = expanded || laneIndex < d.autoExpandLanes;

    // Live output tail (VISION check 7): useLaneTail streams the SAME live message
    // store the session chat screen reads — a real tail, not the oracle's
    // lastAssistantText snapshot. Privacy gate is unchanged: a seat that isn't
    // renderSafe stays gated with the exact same fail-closed treatment as before,
    // regardless of what the tail hook returns. Gated on effectiveExpanded too —
    // sessionId must stay null for a collapsed tile so useLaneTail's loader
    // (sync.onSessionVisible) does NOT fire for every lane on the board just
    // because it's rendered; it should fire only once a tile is actually expanded
    // (fixes a lane-A verify defect: this used to fire unconditionally on mount).
    const renderSafeGate = !seat || seat.renderSafe === true;
    const { items: tailItems, isLoaded: tailLoaded } = useLaneTail(renderSafeGate && effectiveExpanded ? session.id : null);

    // Recursive-tier nesting styles: only apply when depth > 0 so the depth-0
    // (root) render is byte-identical to the pre-tree flat surface.
    const nestedStyle = depth > 0 ? {
        marginLeft: depth * NESTED_INDENT_PX,
        borderLeftWidth: 2,
        borderLeftColor: theme.colors.divider,
        paddingLeft: Math.max(d.cardPaddingH, 10),
    } : null;

    return (
        <Pressable
            style={[
                styles.laneTile,
                { borderRadius: d.cardRadius, paddingVertical: d.cardPaddingV, paddingHorizontal: d.cardPaddingH, marginBottom: d.cardGap, minHeight: Math.max(64, d.minTouchSize + 32) },
                nestedStyle,
                selected && styles.laneTileSelected,
            ]}
            onPress={() => navigateToSession(session.id)}
        >
            <View style={styles.laneTileRow}>
                <View style={styles.laneAvatar}>
                    <Avatar id={seat ? seat.seat : session.avatarId} size={d.laneAvatarSize} monochrome={!health?.isConnected && honest.label !== 'working'} flavor={session.flavor} />
                </View>
                <View style={styles.laneCenter}>
                    <View style={styles.laneTitleRow}>
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
                    <KanbanChips counts={kanban} typeScale={d.typeScale} />
                </View>
                <Pressable
                    hitSlop={8}
                    onPress={() => {
                        // Cheap-but-classy expand/collapse — the codebase's established
                        // pattern (see (app)/new/index.tsx's config-panel toggle) rather
                        // than a new animation dependency.
                        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                        setExpanded((v) => !v);
                    }}
                    style={[styles.expandToggle, { minWidth: d.minTouchSize, minHeight: d.minTouchSize, alignItems: 'center', justifyContent: 'center' }]}
                >
                    <Text style={[styles.expandChevron, { fontSize: scaled(14, d.typeScale) }]}>{effectiveExpanded ? '▴' : '▾'}</Text>
                </Pressable>
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
                </View>
            ) : null}

            {/* GOD -> WORKER fan-out — always visible when this lane has fanned-out
                workers (mirrors FloorTile: the roster is not gated behind expand). */}
            <WorkerFanout workers={workers} rosterUnreachable={rosterUnreachable} inferred />
        </Pressable>
    );
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
        active: seat.verdict === 'alive',
        machineId: null,
        path: null,
        homeDir: null,
        completedTodosCount: 0,
        totalTodosCount: 0,
        hasUnread: false,
        claudeSessionId: seat.claudeSid ?? null,
    };
}

function TheWorkPlane({ selectedSessionId, mockRoster }: {
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
    const { seats: kanbanSeats } = useCongressKanban();
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
                kanban={kanbanSeats.get(node.seat.seat)}
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
                    kanban={row.seat ? kanbanSeats.get(row.seat.seat) : undefined}
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

// ============================================================================
// PLANE 3 — VITALS (ambient telemetry). Vram/Disk/Context/Heartbeat/Backlog
// collapse into ONE compact dot-row + one-line summary each. Boring-when-healthy;
// tap a dot to expand to the full gauge. A dead feed reads LOUD (red dot), never
// a calm lie — the strip inherits useHonestFeed's three-state discipline directly
// (each dot is unreachable ? red : derived-from-data, never a default green).
// ============================================================================

type VitalKey = 'vram' | 'disk' | 'context' | 'backlog';

// G17/G18 folded in: a blanket "unreachable -> red" collapses two different honest
// states into one alarm color. `hasData` distinguishes them:
//   - unreachable && hasData   -> DEAD.       This feed had a good read and lost it.
//   - unreachable && !hasData  -> BINDING.     No successful read has landed YET (first
//     paint / a fresh boot's poll hasn't settled) — genuinely unknown, not confidently
//     dead, so it must not paint the same alarm red as a confirmed-dead feed. It must
//     ALSO never paint a calm green (that would be the exact G10 lie this floor exists
//     to close) — GREY (the same "can't verify yet" tone `deriveLiveness` uses) is the
//     honest middle state.
//   - !unreachable && warning  -> RECOVERING/DEGRADED (amber) — reachable, values read,
//     but something in the data itself needs a look.
//   - !unreachable && !warning -> healthy green, backed by an actual fresh read.
function vitalDotColor(unreachable: boolean, hasWarning: boolean, hasData: boolean): string {
    if (unreachable) return hasData ? RED : GREY;
    if (hasWarning) return AMBER;
    return GREEN;
}

function VitalsStrip() {
    const dens = useDensity();
    const vram = useVram();
    const disk = useDisk();
    const heartbeat = useHeartbeat();
    const backlog = useBacklog();
    const [expandedKey, setExpandedKey] = React.useState<VitalKey | null>(null);

    const vramWarn = !!vram.view && vram.view.totalMB > 0 && (vram.view.usedMB / vram.view.totalMB) >= 0.75;
    const diskWarn = !!disk.view && disk.view.boxes.some((b) => !b.reachable || b.drives.some((d) => d.status === 'warn' || d.status === 'act'));
    const contextWarn = !!heartbeat.view && (heartbeat.view.anyOverdue || heartbeat.view.seats.some((s) => s.inDangerZone || s.gateState === 'FIRE' || s.gateState === 'unreadable'));
    const backlogWarn = !!backlog.view && backlog.view.total > 0 && backlog.view.perSeat.some((s) => (s.oldestAgeSec ?? 0) >= 300);

    // G17/G18: "binding" (no successful read yet — first paint, or a boot still in
    // progress) reads as an honest "reading..." rather than silently sharing text with
    // either the healthy '—' or the confirmed-dead "can't read X" copy.
    const vramSummary = vram.unreachable
        ? (vram.view ? "can't read the GPU" : 'reading…')
        : vram.view
            ? `${Math.round((vram.view.usedMB / Math.max(1, vram.view.totalMB)) * 100)}% used`
            : '—';
    const diskSummary = disk.unreachable
        ? (disk.view ? "can't read disk" : 'reading…')
        : disk.view
            ? (diskWarn ? `${disk.view.boxes.filter((b) => !b.reachable).length + disk.view.boxes.reduce((n, b) => n + b.drives.filter((d) => d.status !== 'green').length, 0)} to watch` : 'all disks healthy')
            : '—';
    const contextSummary = heartbeat.unreachable
        ? (heartbeat.view ? "can't read heartbeat" : 'reading…')
        : heartbeat.view
            ? (heartbeat.view.anyOverdue ? 'overdue' : contextWarn ? 'seat near gate' : 'all seats calm')
            : '—';
    const backlogSummary = backlog.unreachable
        ? (backlog.view ? "can't read backlog" : 'reading…')
        : backlog.view
            ? (backlog.view.total > 0 ? `${backlog.view.total} queued` : 'backlog clear')
            : '—';

    const dots: { key: VitalKey; label: string; color: string; summary: string }[] = [
        { key: 'vram', label: 'VRAM', color: vitalDotColor(vram.unreachable, vramWarn, !!vram.view), summary: vramSummary },
        { key: 'disk', label: 'DISK', color: vitalDotColor(disk.unreachable, diskWarn, !!disk.view), summary: diskSummary },
        { key: 'context', label: 'CTX', color: vitalDotColor(heartbeat.unreachable, contextWarn, !!heartbeat.view), summary: contextSummary },
        { key: 'backlog', label: 'BKLG', color: vitalDotColor(backlog.unreachable, backlogWarn, !!backlog.view), summary: backlogSummary },
    ];

    return (
        <View style={styles.plane}>
            <Text style={[styles.planeTitle, { fontSize: scaled(13, dens.typeScale) }]}>VITALS</Text>
            <View style={[styles.vitalsRow, { gap: dens.cardGap }]}>
                {dots.map((d) => (
                    <Pressable
                        key={d.key}
                        style={[
                            styles.vitalDotWrap,
                            {
                                gap: Math.max(4, Math.round(dens.cardGap * 0.6)),
                                paddingHorizontal: dens.cardPaddingH,
                                paddingVertical: dens.cardPaddingV,
                                minWidth: scaled(140, dens.typeScale),
                            },
                        ]}
                        onPress={() => {
                            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                            setExpandedKey((k) => (k === d.key ? null : d.key));
                        }}
                    >
                        <StatusDot color={d.color} size={8} />
                        <Text style={[styles.vitalLabel, { fontSize: scaled(11, dens.typeScale) }]}>{d.label}</Text>
                        <Text style={[styles.vitalSummary, { fontSize: scaled(11, dens.typeScale) }]} numberOfLines={1}>{d.summary}</Text>
                    </Pressable>
                ))}
            </View>

            {expandedKey === 'vram' ? <VramGauge /> : null}
            {expandedKey === 'disk' ? <DiskGauge /> : null}
            {expandedKey === 'context' ? <ContextGauge /> : null}
            {expandedKey === 'backlog' ? <BacklogGauge /> : null}
        </View>
    );
}

// ============================================================================
// PLANE 4 — RELAY (mission A3). Newest-last inter-seat message feed, mono
// style matching the lane tail. Boring-when-healthy: an empty relay is a
// quiet line, never an empty labeled box; a dead feed is honest-empty (the
// feed's own stale/unreachable state degrades to zero items, not a fake row —
// see apiCongressRelay.ts/useCongressRelay.ts). Density-aware: desktop shows
// the last ~8 with scroll, phone collapses to a tap-to-expand section.
// ============================================================================

const RELAY_DESKTOP_VISIBLE = 8;

function RelayRow({ item, typeScale }: { item: CongressRelayItem; typeScale: number }) {
    const ts = item.ts != null ? new Date(item.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--:--';
    return (
        <Text style={[styles.relayRowText, { fontSize: scaled(12, typeScale) }]} numberOfLines={1}>
            {ts} · {item.from} → {item.to} · {item.excerpt}
        </Text>
    );
}

function RelayPlane() {
    const d = useDensity();
    const { items, unreachable } = useCongressRelay();
    const [phoneExpanded, setPhoneExpanded] = React.useState(false);

    // Honest empty state: nothing to relay AND the feed isn't unreachable ->
    // the calm all-clear line, same pattern as NeedsYouPlane's quiet state.
    if (items.length === 0 && !unreachable) {
        return (
            <View style={[styles.plane, { marginBottom: d.planeGap }]}>
                <Text style={[styles.planeTitle, { fontSize: scaled(13, d.typeScale) }]}>RELAY</Text>
                <View style={styles.quietLineRow}>
                    <StatusDot color={GREY} size={6} />
                    <Text style={[styles.quietLine, { fontSize: scaled(13, d.typeScale) }]}>No relay traffic</Text>
                </View>
            </View>
        );
    }

    if (items.length === 0 && unreachable) {
        return (
            <View style={[styles.plane, { marginBottom: d.planeGap }]}>
                <Text style={[styles.planeTitle, { fontSize: scaled(13, d.typeScale) }]}>RELAY</Text>
                <View style={[styles.unreachableCard, { borderRadius: d.cardRadius, paddingVertical: d.cardPaddingV, paddingHorizontal: d.cardPaddingH }]}>
                    <FeedUnreachable message="can't reach the relay log" />
                </View>
            </View>
        );
    }

    // Phone: collapsed-by-default section, tap the header to expand (mirrors
    // VitalsStrip's tap-to-expand gauge pattern rather than a new toggle idiom).
    if (d.density === 'phone' && !phoneExpanded) {
        return (
            <View style={[styles.plane, { marginBottom: d.planeGap }]}>
                <Pressable onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setPhoneExpanded(true); }}>
                    <Text style={[styles.planeTitle, { fontSize: scaled(13, d.typeScale) }]}>RELAY · {items.length} · tap to expand</Text>
                </Pressable>
            </View>
        );
    }

    const desktopVisible = items.slice(-RELAY_DESKTOP_VISIBLE);

    return (
        <View style={[styles.plane, { marginBottom: d.planeGap }]}>
            <Pressable disabled={d.density !== 'phone'} onPress={() => setPhoneExpanded(false)}>
                <Text style={[styles.planeTitle, { fontSize: scaled(13, d.typeScale) }]}>RELAY · {items.length}</Text>
            </Pressable>
            {d.density === 'desktop' ? (
                <ScrollView style={styles.relayScroll} nestedScrollEnabled>
                    {desktopVisible.map((item) => <RelayRow key={item.id} item={item} typeScale={d.typeScale} />)}
                </ScrollView>
            ) : (
                items.slice(-4).map((item) => <RelayRow key={item.id} item={item} typeScale={d.typeScale} />)
            )}
        </View>
    );
}

// ============================================================================
// ROOT — three planes, top to bottom. THE WORK is the default view (no black
// void, no hand-pick-a-session-first gate).
// ============================================================================

// Dev-only density picker. The cockpit's three postures (desktop / phone / deck)
// all read the SAME component tree — this segmented control switches the
// DensityContext value so the desk can dogfood all three in one browser tab
// without simulating device widths. Not shipped to the live surface.
function DensityPicker({ density, onChange }: { density: Density; onChange: (d: Density) => void }) {
    const options: Density[] = ['desktop', 'deck', 'phone'];
    return (
        <View style={styles.densityPicker}>
            {options.map((opt) => {
                const active = opt === density;
                return (
                    <Pressable
                        key={opt}
                        onPress={() => onChange(opt)}
                        style={[styles.densityChip, active && styles.densityChipActive]}
                    >
                        <Text style={[styles.densityChipText, active && styles.densityChipTextActive]}>
                            {opt}
                        </Text>
                    </Pressable>
                );
            })}
        </View>
    );
}

// Dev-only mock-roster toggle. When ON, TheWorkPlane consumes the hardcoded
// MOCK_RECURSIVE_ROSTER fixture (penthouse-god -> 2 floor-gods -> 1-2 workers
// each) so the recursive-tier render code path can be exercised even while
// the live seats-oracle roster is still a flat forest (no real seat has
// parent_seat_id set yet). NOT shipped to the live surface — cockpit-v2 is a
// dev route only, and this toggle is scoped to it.
function MockRosterToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
    return (
        <Pressable
            onPress={() => onChange(!on)}
            style={[styles.densityChip, on && styles.densityChipActive]}
        >
            <Text style={[styles.densityChipText, on && styles.densityChipTextActive]}>
                {on ? 'Mock roster: ON' : 'Mock recursive roster'}
            </Text>
        </Pressable>
    );
}

// ============================================================================
// HEADER — considered identity for the unified command surface. Title +
// live-seat-count + a status dot, no cheesy branding. The dot/count are
// derived from the SAME roster feed + deriveLiveness verdict every lane tile
// already uses (never a second, independent "is it healthy" computation) —
// unreachable reads GREY-unverified (matches deriveLiveness's own
// fail-closed default for an unreachable poll), a reachable roster with zero
// live seats reads GREY-idle, and at least one 'alive' seat reads GREEN.
// Boring-when-healthy, honest-null when the roster hasn't answered yet.
// ============================================================================

function CockpitHeader() {
    const d = useDensity();
    const { sessions, workers, unreachable } = useCongressRoster();

    const { liveCount, totalCount } = React.useMemo(() => {
        const seats = [...sessions.values(), ...workers];
        let live = 0;
        for (const seat of seats) {
            if (deriveLiveness(seat, unreachable).online) live += 1;
        }
        return { liveCount: live, totalCount: seats.length };
    }, [sessions, workers, unreachable]);

    const dotColor = unreachable ? GREY : liveCount > 0 ? GREEN : GREY;
    const statusLabel = unreachable
        ? 'roster unreachable'
        : totalCount === 0
            ? 'no seats yet'
            : `${liveCount} of ${totalCount} live`;

    return (
        <View style={styles.headerBlock}>
            <View style={styles.headerTitleRow}>
                <Text style={[styles.headerTitle, { fontSize: scaled(22, d.typeScale) }]}>Cockpit</Text>
                <View style={styles.headerStatusChip}>
                    <StatusDot color={dotColor} isPulsing={!unreachable && liveCount > 0} size={7} />
                    <Text style={[styles.headerStatusText, { fontSize: scaled(12, d.typeScale) }]}>{statusLabel}</Text>
                </View>
            </View>
            <Text style={[styles.headerSubtitle, { fontSize: scaled(12.5, d.typeScale) }]}>Carlos's unified command surface</Text>
        </View>
    );
}

// Named export of the main screen component — imported directly by the
// landing route (sources/app/(app)/index.tsx), which is now the default
// export there instead of this dev route. This file stays AT THIS PATH
// (external machine check greps it) and keeps working standalone as
// dev/cockpit-v2 too (below), just rendering the same component.
export function CockpitV2Screen() {
    const [density, setDensity] = React.useState<Density>('desktop');
    const [mockOn, setMockOn] = React.useState(false);
    const router = useRouter();
    const { theme } = useUnistyles();
    // Dev-only affordances (density picker, mock-roster toggle) stay reachable
    // for dogfooding but never show on the production landing surface by
    // default — gated behind the same __DEV__ || devModeEnabled pattern used
    // across the app (see SettingsView.tsx, voice.tsx, ToolFullView.tsx).
    const devModeEnabled = __DEV__ || useLocalSetting('devModeEnabled');
    return (
        <DensityContext.Provider value={density}>
            <ScrollView contentContainerStyle={styles.scroll}>
                <View style={styles.container}>
                    <View style={styles.topBarRow}>
                        <CockpitHeader />
                        <Pressable
                            hitSlop={8}
                            onPress={() => router.push('/sessions/index')}
                            style={styles.sessionsLinkButton}
                            accessibilityLabel="Classic session list"
                        >
                            <Ionicons name="list" size={18} color={theme.colors.textSecondary} />
                        </Pressable>
                    </View>
                    {devModeEnabled ? (
                        <View style={styles.devToolsRow}>
                            <DensityPicker density={density} onChange={setDensity} />
                            <MockRosterToggle on={mockOn} onChange={setMockOn} />
                        </View>
                    ) : null}
                    <NeedsYouPlane />
                    <TheWorkPlane mockRoster={mockOn ? MOCK_RECURSIVE_ROSTER : null} />
                    <VitalsStrip />
                    <RelayPlane />
                </View>
            </ScrollView>
        </DensityContext.Provider>
    );
}

// dev/cockpit-v2 route itself keeps working — renders the same component.
export default function CockpitV2() {
    return <CockpitV2Screen />;
}

const styles = StyleSheet.create((theme) => ({
    scroll: {
        paddingBottom: 128,
    },
    container: {
        width: '100%',
        maxWidth: layout.maxWidth,
        alignSelf: 'center',
        paddingHorizontal: 16,
        paddingTop: 16,
    },
    topBarRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    headerBlock: {
        flex: 1,
        minWidth: 0,
    },
    headerTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
    },
    headerTitle: {
        fontSize: 22,
        color: theme.colors.text,
        letterSpacing: -0.3,
        ...Typography.default('semiBold'),
    },
    headerStatusChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 20,
        backgroundColor: theme.colors.groupped.background,
    },
    headerStatusText: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        ...Typography.default('semiBold'),
    },
    headerSubtitle: {
        fontSize: 12.5,
        color: theme.colors.textSecondary,
        marginTop: 2,
        ...Typography.default(),
    },
    devToolsRow: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 14,
        marginBottom: 4,
        alignItems: 'center',
        flexWrap: 'wrap',
    },
    sessionsLinkButton: {
        padding: 8,
        marginLeft: 8,
    },
    densityPicker: {
        flexDirection: 'row',
        gap: 6,
        marginBottom: 12,
        alignSelf: 'flex-start',
    },
    densityChip: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 6,
        backgroundColor: theme.colors.groupped.background,
    },
    densityChipActive: {
        backgroundColor: theme.colors.textLink,
    },
    densityChipText: {
        fontSize: 11,
        color: theme.colors.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        ...Typography.default('semiBold'),
    },
    densityChipTextActive: {
        color: '#FFFFFF',
    },
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
    // LOUD-but-considered: a dead feed gets a card, not a bare line — the destructive
    // TOKEN border makes it unmissable without inventing a second alarm color.
    unreachableCard: {
        backgroundColor: theme.colors.surface,
        borderLeftWidth: 3,
        borderLeftColor: theme.colors.textDestructive,
    },

    // --- NEEDS-YOU cards (unchanged visual language from the prior card-state cut) ---
    needsYouCard: {
        backgroundColor: theme.colors.surface,
        borderRadius: 12,
        borderLeftWidth: 3,
        paddingVertical: 12,
        paddingHorizontal: 14,
        marginBottom: 8,
    },
    needsYouCardSettled: {
        opacity: 0.7,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 4,
    },
    sender: {
        flex: 1,
        fontSize: 12,
        color: theme.colors.textSecondary,
        ...Typography.default('semiBold'),
    },
    kindChip: {
        borderRadius: 6,
        paddingHorizontal: 6,
        paddingVertical: 1,
    },
    kindChipText: {
        fontSize: 10,
        color: '#FFFFFF',
        textTransform: 'uppercase',
        letterSpacing: 0.4,
        ...Typography.default('semiBold'),
    },
    ask: {
        fontSize: 15,
        color: theme.colors.text,
        lineHeight: 20,
        ...Typography.default('semiBold'),
    },
    cascade: {
        fontSize: 12,
        color: ACCENT_GATE,
        marginTop: 6,
        ...Typography.default('semiBold'),
    },
    ack: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        marginTop: 8,
        fontStyle: 'italic',
        ...Typography.default(),
    },
    reauthLink: {
        fontSize: 12,
        color: ACCENT_GATE,
        marginTop: 8,
        textDecorationLine: 'underline',
        ...Typography.default('semiBold'),
    },
    errorLine: {
        fontSize: 12,
        color: ACCENT_GATE,
        marginTop: 8,
        ...Typography.default(),
    },
    replyArea: {
        marginTop: 10,
    },
    input: {
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.divider,
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 8,
        fontSize: 14,
        color: theme.colors.text,
        backgroundColor: theme.colors.groupped.background,
        ...Typography.default(),
    },
    replyButtons: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 8,
    },
    btn: {
        borderRadius: 8,
        paddingHorizontal: 14,
        paddingVertical: 7,
    },
    btnAffirm: {
        backgroundColor: theme.colors.text,
    },
    btnAffirmText: {
        fontSize: 13,
        color: theme.colors.surface,
        ...Typography.default('semiBold'),
    },
    btnDecline: {
        backgroundColor: 'transparent',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.divider,
    },
    btnDeclineText: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        ...Typography.default(),
    },

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

    // --- GOD -> WORKER fan-out (munder FloorTile pattern: god + worker roster) ---
    workerFanout: {
        marginTop: 10,
        paddingTop: 10,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: theme.colors.divider,
    },
    workerFanoutHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 6,
    },
    workerFanoutTitle: {
        fontSize: 11,
        color: theme.colors.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 0.4,
        ...Typography.default('semiBold'),
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
    workerAvatarWrap: {
        alignItems: 'center',
        width: 52,
    },
    workerDot: {
        marginTop: -8,
        marginLeft: 18,
    },
    workerLabel: {
        fontSize: 9.5,
        color: theme.colors.textSecondary,
        textAlign: 'center',
        marginTop: 2,
        ...Typography.default(),
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

    // --- VITALS strip ---
    vitalsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    vitalDotWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: theme.colors.surface,
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 8,
        minWidth: 140,
        // Reserved height (spec's lean invariant): the summary swap never resizes the row.
        minHeight: 36,
    },
    vitalLabel: {
        fontSize: 11,
        color: theme.colors.text,
        letterSpacing: 0.3,
        ...Typography.default('semiBold'),
    },
    vitalSummary: {
        flex: 1,
        fontSize: 11,
        color: theme.colors.textSecondary,
        ...Typography.default(),
    },

    // --- KANBAN CHIPS (mission A3) ---
    kanbanChipsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 5,
        marginTop: 5,
    },
    kanbanChip: {
        paddingHorizontal: 6,
        paddingVertical: 1,
        borderRadius: 5,
        backgroundColor: theme.colors.groupped.background,
    },
    kanbanChipBlocked: {
        backgroundColor: 'rgba(255, 149, 0, 0.12)',
    },
    kanbanChipText: {
        fontSize: 10.5,
        ...Typography.default('semiBold'),
    },
    kanbanChipTextMuted: {
        opacity: 0.7,
    },

    // --- RELAY plane (mission A3) ---
    relayScroll: {
        maxHeight: 200,
    },
    relayRowText: {
        fontSize: 12,
        lineHeight: 17,
        color: theme.colors.text,
        marginBottom: 2,
        ...Typography.mono(),
    },
}));
