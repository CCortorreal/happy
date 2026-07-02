import * as React from 'react';
import { View, Pressable, LayoutAnimation } from 'react-native';
import { Text } from '@/components/StyledText';
import { StyleSheet } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { Avatar } from '@/components/Avatar';
import { FeedUnreachable } from '@/components/HonestSignal';
import { CongressSeat } from '@/sync/congressTypes';
import { SessionRowData } from '@/sync/storage';
import { deriveLiveness, LivenessVerdict } from '@/sync/liveness';
import { congressIdentity } from '@/utils/congressIdentity';
import { useCongressRoster } from '@/hooks/useCongressRoster';
import { useVisibleSessionListViewData } from '@/hooks/useVisibleSessionListViewData';
import { useNavigateToSession } from '@/hooks/useNavigateToSession';
import { CockpitSelectionContext } from '../selection';
import { GREEN, AMBER, RED, GREY, isDimmed } from '../colors';
import { useDensity, scaled } from '../density';

// ============================================================================
// CKP-13 ROSTER LEDGER — the drill-in for dark seats + Column B's empty state.
// One row per roster seat, grouped WORST-FIRST (DARK → WEDGED → UNVERIFIED →
// IDLE → LIVE) so the seats that need a human land at the top. Every row is
// honest: a dead seat renders its last-seen or `no turn on record` (never a
// fabricated timestamp); a roster-unreachable feed renders last-known rows at
// 55% opacity + `showing roster from {age} ago`, never blank.
//
// Identity is deterministic (CKP-12): Avatar id={seat.seat}, dimmed per policy
// (isDimmed), square when sealed — the SAME face the tile + relay chips render.
// ============================================================================

// The five honest tiers, worst-first. deriveLiveness gives us a 5-verdict
// union; we bucket it directly (no re-derivation).
type Tier = 'dark' | 'wedged' | 'unverified' | 'idle' | 'live';
const TIER_ORDER: Tier[] = ['dark', 'wedged', 'unverified', 'idle', 'live'];
const TIER_LABEL: Record<Tier, string> = {
    dark: 'DARK',
    wedged: 'WEDGED',
    unverified: 'UNVERIFIED',
    idle: 'IDLE',
    live: 'LIVE',
};

function tierFor(verdict: LivenessVerdict): Tier {
    if (verdict === 'dead') return 'dark';
    if (verdict === 'wedged') return 'wedged';
    if (verdict === 'unverified') return 'unverified';
    if (verdict === 'idle') return 'idle';
    return 'live'; // 'alive'
}

function verdictWord(verdict: LivenessVerdict): { word: string; color: string } {
    if (verdict === 'dead') return { word: 'dark', color: RED };
    if (verdict === 'wedged') return { word: 'wedged', color: AMBER };
    if (verdict === 'unverified') return { word: 'unverified', color: GREY };
    if (verdict === 'idle') return { word: 'idle', color: GREY };
    return { word: 'live', color: GREEN };
}

// Compact relative age — glanceable staleness, not a clock. Mirrors
// FloorsPlane's boardAgeLabel so the whole cockpit speaks one age dialect.
function ageLabel(tsMs: number): string {
    const ageSec = Math.max(0, Math.round((Date.now() - tsMs) / 1000));
    if (ageSec < 60) return `${ageSec}s`;
    if (ageSec < 3600) return `${Math.round(ageSec / 60)}m`;
    if (ageSec < 86400) return `${Math.round(ageSec / 3600)}h`;
    return `${Math.round(ageSec / 86400)}d`;
}

interface LedgerRow {
    seat: CongressSeat;
    verdict: LivenessVerdict;
    tier: Tier;
    // The session id to select/navigate to, if this seat joins a live session
    // row. null for worker/seat-only rows (watched, not conversable).
    sessionId: string | null;
}

function LedgerRowView({ row, rosterUnreachable, inline }: {
    row: LedgerRow;
    rosterUnreachable: boolean;
    inline: boolean;
}) {
    const d = useDensity();
    const navigateToSession = useNavigateToSession();
    const selection = React.useContext(CockpitSelectionContext);
    const { seat, verdict, sessionId } = row;

    const dimmed = isDimmed(verdict);
    const sealed = seat.cage_status === 'sealed';
    const faded = verdict === 'dead' || verdict === 'unverified';
    const vw = verdictWord(verdict);

    const role = seat.role?.trim() || 'no role';
    const pedal = seat.pedal?.trim() ?? 'no pedal';
    const subLine = `${role} · ${pedal}`;

    // Honest last-seen: lastTextTs null -> `no turn on record` (never fabricate).
    const lastSeen = seat.lastTextTs != null
        ? `last turn ${ageLabel(seat.lastTextTs)} ago`
        : 'no turn on record';

    const onPress = React.useCallback(() => {
        if (sessionId == null) return; // worker/seat-only — nothing to steer or open
        if (inline) {
            navigateToSession(sessionId);
        } else {
            selection.select(sessionId, seat.seat);
        }
    }, [sessionId, inline, navigateToSession, selection, seat.seat]);

    return (
        <Pressable
            style={[styles.row, rosterUnreachable && styles.rowStale]}
            onPress={onPress}
            disabled={sessionId == null}
        >
            <Avatar id={seat.seat} size={28} monochrome={dimmed} square={sealed} />
            <View style={styles.rowCenter}>
                <Text
                    style={[styles.rowName, { fontSize: scaled(13, d.typeScale) }, faded && styles.faded]}
                    numberOfLines={1}
                >
                    {seat.seat}
                </Text>
                <Text style={[styles.rowSub, { fontSize: scaled(11, d.typeScale) }]} numberOfLines={1}>
                    {subLine}
                </Text>
            </View>
            <View style={styles.rowRight}>
                <Text style={[styles.verdictWord, { color: vw.color, fontSize: scaled(11.5, d.typeScale) }]}>
                    {vw.word}
                </Text>
                <Text style={[styles.rowLastSeen, { fontSize: scaled(10.5, d.typeScale) }]} numberOfLines={1}>
                    {lastSeen}
                </Text>
            </View>
        </Pressable>
    );
}

export const RosterLedger = React.memo(function RosterLedger({ inline }: { inline?: boolean }) {
    const d = useDensity();
    const { sessions, workers, unreachable } = useCongressRoster();
    const data = useVisibleSessionListViewData();

    // seat.seat -> live session id, so a ledger row can select/navigate to the
    // session it joins. Workers never join a session (watched, not conversable).
    const sessionIdBySeat = React.useMemo(() => {
        const m = new Map<string, string>();
        if (data) {
            const rows: SessionRowData[] = [];
            for (const item of data) {
                if (item.type === 'session') rows.push(item.session);
                else if (item.type === 'active-sessions') rows.push(...item.sessions);
            }
            for (const s of rows) {
                const seat = (s.claudeSessionId != null ? sessions.get(s.claudeSessionId) : undefined) ?? sessions.get(s.id);
                if (seat) m.set(seat.seat, s.id);
            }
        }
        return m;
    }, [data, sessions]);

    // Dedupe sessions (dual-keyed by claudeSid + cuid) by seat id, then append
    // workers — the full roster, one row per seat.
    const rows: LedgerRow[] = React.useMemo(() => {
        const seen = new Set<string>();
        const out: LedgerRow[] = [];
        const push = (seat: CongressSeat) => {
            if (seen.has(seat.seat)) return;
            seen.add(seat.seat);
            const { verdict } = deriveLiveness(seat, unreachable);
            out.push({
                seat,
                verdict,
                tier: tierFor(verdict),
                sessionId: sessionIdBySeat.get(seat.seat) ?? null,
            });
        };
        for (const seat of sessions.values()) push(seat);
        for (const seat of workers) push(seat);
        return out;
    }, [sessions, workers, unreachable, sessionIdBySeat]);

    // Newest roster ts we can point at for the "showing roster from {age} ago"
    // staleness line — the freshest lastTextTs across seats (best-effort).
    const staleAge = React.useMemo(() => {
        let newest: number | null = null;
        for (const r of rows) {
            if (r.seat.lastTextTs != null && (newest == null || r.seat.lastTextTs > newest)) {
                newest = r.seat.lastTextTs;
            }
        }
        return newest != null ? ageLabel(newest) : null;
    }, [rows]);

    const grouped = React.useMemo(() => {
        const byTier = new Map<Tier, LedgerRow[]>();
        for (const r of rows) {
            const list = byTier.get(r.tier) ?? [];
            list.push(r);
            byTier.set(r.tier, list);
        }
        return byTier;
    }, [rows]);

    // Roster unreachable with NO last-known rows -> honest banner, never blank.
    if (unreachable && rows.length === 0) {
        return (
            <View style={styles.container}>
                <FeedUnreachable message="can't reach the roster" />
            </View>
        );
    }

    // Reachable + empty -> quiet grey line, never an empty labeled box.
    if (!unreachable && rows.length === 0) {
        return (
            <View style={styles.container}>
                <Text style={[styles.quietLine, { fontSize: scaled(13, d.typeScale) }]}>
                    No seats on the roster
                </Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {unreachable ? (
                <View style={styles.staleBanner}>
                    <FeedUnreachable message="can't reach the roster" />
                    <Text style={[styles.staleAgeLine, { fontSize: scaled(11, d.typeScale) }]}>
                        showing roster from {staleAge ?? 'an unknown time'} ago
                    </Text>
                </View>
            ) : null}
            {TIER_ORDER.map((tier) => {
                const list = grouped.get(tier);
                if (!list || list.length === 0) return null;
                return (
                    <View key={tier} style={styles.section}>
                        <Text style={[styles.sectionHeader, { fontSize: scaled(11, d.typeScale) }]}>
                            {TIER_LABEL[tier]} · {list.length}
                        </Text>
                        {list.map((row) => (
                            <LedgerRowView
                                key={row.seat.seat}
                                row={row}
                                rosterUnreachable={unreachable}
                                inline={!!inline}
                            />
                        ))}
                    </View>
                );
            })}
        </View>
    );
});

const styles = StyleSheet.create((theme) => ({
    container: {
        paddingHorizontal: 4,
        paddingBottom: 8,
    },
    quietLine: {
        color: theme.colors.textSecondary,
        paddingVertical: 8,
        ...Typography.default(),
    },
    staleBanner: {
        marginBottom: 8,
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderLeftWidth: 3,
        borderLeftColor: theme.colors.textDestructive,
        backgroundColor: theme.colors.surface,
        borderRadius: 8,
    },
    staleAgeLine: {
        color: theme.colors.textSecondary,
        marginTop: 2,
        ...Typography.default(),
    },
    section: {
        marginBottom: 10,
    },
    sectionHeader: {
        color: theme.colors.groupped.sectionTitle,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 4,
        marginLeft: 2,
        ...Typography.default('semiBold'),
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        minHeight: 44,
        paddingVertical: 6,
        paddingHorizontal: 4,
    },
    // Roster-unreachable last-known rows read at 55% — visibly stale, not blank.
    rowStale: {
        opacity: 0.55,
    },
    rowCenter: {
        flex: 1,
        minWidth: 0,
    },
    rowName: {
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
    // A dead/unverified seat's NAME reads at 55% — drained, matching its dimmed face.
    faded: {
        opacity: 0.55,
    },
    rowSub: {
        color: theme.colors.textSecondary,
        marginTop: 1,
        ...Typography.default(),
    },
    rowRight: {
        alignItems: 'flex-end',
    },
    verdictWord: {
        ...Typography.default('semiBold'),
    },
    rowLastSeen: {
        color: theme.colors.textSecondary,
        marginTop: 1,
        ...Typography.default(),
    },
}));
