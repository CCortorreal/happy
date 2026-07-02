import * as React from 'react';
import { View, TextInput, Pressable, ScrollView } from 'react-native';
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
import { useNavigateToSession } from '@/hooks/useNavigateToSession';
import { CongressSeat } from '@/sync/congressTypes';
import { SessionRowData } from '@/sync/storage';
import { deriveLiveness } from '@/sync/liveness';
import { congressIdentity } from '@/utils/congressIdentity';
import { congressHealthStatus, voiceThought, contextPressure } from '@/components/SessionsList';
import { useVram } from '@/hooks/useVram';
import { useDisk } from '@/hooks/useDisk';
import { useHeartbeat } from '@/hooks/useHeartbeat';
import { useBacklog } from '@/hooks/useBacklog';
import { VramGauge } from '@/components/VramGauge';
import { DiskGauge } from '@/components/DiskGauge';
import { ContextGauge } from '@/components/ContextGauge';
import { BacklogGauge } from '@/components/BacklogGauge';

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

    return (
        <View style={[styles.needsYouCard, { borderLeftColor: settled ? GREEN : accent }, settled && styles.needsYouCardSettled]}>
            <View style={styles.headerRow}>
                <Text style={styles.sender} numberOfLines={1}>{item.from}</Text>
                <View style={[styles.kindChip, { backgroundColor: settled ? GREEN : accent }]}>
                    <Text style={styles.kindChipText}>{isGate ? 'GATE' : 'ROUTINE'}</Text>
                </View>
            </View>

            <Text style={styles.ask} numberOfLines={settled ? 2 : 4}>{firstLine(item.q)}</Text>

            {blocking > 0 && !settled ? (
                <Text style={styles.cascade}>⛒ blocking {blocking} downstream {blocking === 1 ? 'task' : 'tasks'}</Text>
            ) : null}

            {settled ? (
                <Text style={styles.ack}>✓ Got it — sent to {item.from}</Text>
            ) : (
                <View style={styles.replyArea}>
                    <TextInput
                        style={styles.input}
                        value={draft}
                        onChangeText={setDraft}
                        placeholder="write back…"
                        placeholderTextColor={theme.colors.textSecondary}
                        onSubmitEditing={() => submit(draft)}
                        returnKeyType="send"
                        blurOnSubmit={false}
                    />
                    <View style={styles.replyButtons}>
                        <Pressable style={[styles.btn, styles.btnAffirm]} onPress={() => submit(draft.trim() ? `Go ahead — ${draft.trim()}` : 'Go ahead')}>
                            <Text style={styles.btnAffirmText}>Respond &amp; unblock</Text>
                        </Pressable>
                        <Pressable style={[styles.btn, styles.btnDecline]} onPress={() => submit('Not now')}>
                            <Text style={styles.btnDeclineText}>Not now</Text>
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
    // labeled box. A dead feed with nothing to show is the one exception — LOUD.
    if (needsYou.length === 0) {
        if (unreachable) {
            return (
                <View style={styles.plane}>
                    <FeedUnreachable message="can't reach the Warden — answers won't send" />
                </View>
            );
        }
        return (
            <View style={styles.plane}>
                <Text style={styles.quietLine}>Nothing needs you right now</Text>
            </View>
        );
    }

    return (
        <View style={styles.plane}>
            <Text style={styles.planeTitle}>NEEDS YOU{openCount > 0 ? ` · ${openCount}` : ''}</Text>
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
    const { verdict } = deriveLiveness(worker, rosterUnreachable);
    const color = verdict === 'alive' ? GREEN : verdict === 'wedged' ? AMBER : verdict === 'dead' ? RED : GREY;
    const label = worker.currentWork?.trim() || worker.model?.trim() || worker.role?.trim() || worker.seat;
    return (
        <View style={styles.workerAvatarWrap}>
            <Avatar id={worker.seat} size={26} monochrome={verdict !== 'alive'} />
            <StatusDot color={color} isPulsing={verdict === 'alive'} size={7} style={styles.workerDot} />
            <Text style={styles.workerLabel} numberOfLines={1}>{label}</Text>
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
    if (workers.length === 0) return null;
    const shown = workers.slice(0, WORKER_AVATAR_SHOWN);
    const overflow = workers.length - shown.length;
    return (
        <View style={styles.workerFanout}>
            <View style={styles.workerFanoutHeaderRow}>
                <Text style={styles.workerFanoutTitle}>
                    workers · {workers.length}
                </Text>
                {inferred ? (
                    <Text style={styles.workerFanoutInferred}>grouped by host+pedal — inferred, not a proven link</Text>
                ) : null}
            </View>
            <View style={styles.workerRoster}>
                {shown.map((w, i) => (
                    <WorkerAvatar key={`${w.seat}-${i}`} worker={w} rosterUnreachable={rosterUnreachable} />
                ))}
                {overflow > 0 ? <Text style={styles.workerMore}>+{overflow} more</Text> : null}
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

function LaneTile({ row, rosterUnreachable, selected, workers }: {
    row: LaneRow;
    rosterUnreachable: boolean;
    selected: boolean;
    // This lane's fanned-out worker roster (host+pedal-inferred grouping — see
    // groupWorkersByLane). Empty when the lane has no god->worker fan-out today.
    workers: CongressSeat[];
}) {
    const { theme } = useUnistyles();
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

    // Live output tail: the data layer does NOT yet expose a streaming Claude-output
    // tail per lane (grepped — no such feed exists today). The closest honest signal is
    // the oracle's lastAssistantText, privacy-gated by renderSafe (fail-closed). When
    // that's absent we say so plainly rather than fabricate a tail.
    const canShowTail = !!seat && seat.renderSafe === true && !!seat.lastAssistantText;
    const tailText = canShowTail ? seat!.lastAssistantText! : null;

    return (
        <Pressable
            style={[styles.laneTile, selected && styles.laneTileSelected]}
            onPress={() => navigateToSession(session.id)}
        >
            <View style={styles.laneTileRow}>
                <View style={styles.laneAvatar}>
                    <Avatar id={seat ? seat.seat : session.avatarId} size={40} monochrome={!health?.isConnected && honest.label !== 'working'} flavor={session.flavor} />
                </View>
                <View style={styles.laneCenter}>
                    <View style={styles.laneTitleRow}>
                        <Text style={styles.laneTitle} numberOfLines={1}>{session.name}</Text>
                        {pressure ? (
                            <Text style={[styles.lanePressure, { color: pressure.color }]}>{pressure.label}</Text>
                        ) : null}
                    </View>
                    <Text style={styles.laneIdentity} numberOfLines={1}>{identity}</Text>
                    <View style={styles.laneStatusRow}>
                        <StatusDot color={honest.color} isPulsing={honest.label === 'working'} size={7} />
                        <Text
                            style={[styles.laneThought, { color: honest.color }, thought?.stale && styles.laneThoughtStale]}
                            numberOfLines={expanded ? 4 : 1}
                        >
                            {workLine}
                        </Text>
                    </View>
                </View>
                <Pressable hitSlop={8} onPress={() => setExpanded((v) => !v)} style={styles.expandToggle}>
                    <Text style={styles.expandChevron}>{expanded ? '▴' : '▾'}</Text>
                </Pressable>
            </View>

            {expanded ? (
                <View style={styles.laneTail}>
                    {tailText ? (
                        <Text style={styles.laneTailText} numberOfLines={6}>{tailText}</Text>
                    ) : (
                        // Honest-not-fabricated: the spec asks for a live output tail;
                        // this data layer doesn't expose a stream yet — say so, don't fake it.
                        <Text style={styles.laneTailMissing}>
                            no live output tail wired yet — the oracle hasn't published a render-safe transcript signal for this lane
                        </Text>
                    )}
                </View>
            ) : null}

            {/* GOD -> WORKER fan-out — always visible when this lane has fanned-out
                workers (mirrors FloorTile: the roster is not gated behind expand). */}
            <WorkerFanout workers={workers} rosterUnreachable={rosterUnreachable} inferred />
        </Pressable>
    );
}

function TheWorkPlane({ selectedSessionId }: { selectedSessionId?: string }) {
    const data = useVisibleSessionListViewData();
    const { sessions: roster, workers, unreachable: rosterUnreachable } = useCongressRoster();

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

    if (!data) {
        // First paint, no data yet — quiet, never a fake board.
        return <View style={styles.plane} />;
    }

    if (lanes.length === 0) {
        return (
            <View style={styles.plane}>
                <Text style={styles.planeTitle}>THE WORK</Text>
                <Text style={styles.quietLine}>No active lanes — the board is empty</Text>
            </View>
        );
    }

    return (
        <View style={styles.plane}>
            <View style={styles.planeTitleRow}>
                <Text style={styles.planeTitle}>THE WORK · {lanes.length}</Text>
                {rosterUnreachable ? (
                    <Text style={styles.planeTitleWarn}>congress roster unreachable — showing last-known lanes</Text>
                ) : null}
            </View>
            {lanes.map((row) => (
                <LaneTile
                    key={row.session.id}
                    row={row}
                    rosterUnreachable={rosterUnreachable}
                    selected={row.session.id === selectedSessionId}
                    workers={workersByLane.get(row.session.id) ?? []}
                />
            ))}
            {ungroupedWorkers.length > 0 ? (
                <View style={styles.ungroupedWorkersBlock}>
                    <Text style={styles.workerFanoutInferred}>
                        {ungroupedWorkers.length} worker{ungroupedWorkers.length === 1 ? '' : 's'} with no host+pedal match to a lane on screen — shown unassigned rather than guessed into a lane
                    </Text>
                    <View style={styles.workerRoster}>
                        {ungroupedWorkers.slice(0, WORKER_AVATAR_SHOWN).map((w, i) => (
                            <WorkerAvatar key={`${w.seat}-${i}`} worker={w} rosterUnreachable={rosterUnreachable} />
                        ))}
                        {ungroupedWorkers.length > WORKER_AVATAR_SHOWN ? (
                            <Text style={styles.workerMore}>+{ungroupedWorkers.length - WORKER_AVATAR_SHOWN} more</Text>
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
            <Text style={styles.planeTitle}>VITALS</Text>
            <View style={styles.vitalsRow}>
                {dots.map((d) => (
                    <Pressable
                        key={d.key}
                        style={styles.vitalDotWrap}
                        onPress={() => setExpandedKey((k) => (k === d.key ? null : d.key))}
                    >
                        <StatusDot color={d.color} size={8} />
                        <Text style={styles.vitalLabel}>{d.label}</Text>
                        <Text style={styles.vitalSummary} numberOfLines={1}>{d.summary}</Text>
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
// ROOT — three planes, top to bottom. THE WORK is the default view (no black
// void, no hand-pick-a-session-first gate).
// ============================================================================

export default function CockpitV2() {
    return (
        <ScrollView contentContainerStyle={styles.scroll}>
            <View style={styles.container}>
                <NeedsYouPlane />
                <TheWorkPlane />
                <VitalsStrip />
            </View>
        </ScrollView>
    );
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
    quietLine: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        paddingVertical: 8,
        paddingHorizontal: 4,
        ...Typography.default(),
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
}));
