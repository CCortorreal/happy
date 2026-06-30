import React from 'react';
import { View, Pressable, FlatList, Platform, TextInput } from 'react-native';
import { Text } from '@/components/StyledText';
import { usePathname } from 'expo-router';
import { SessionListViewItem, SessionRowData } from '@/sync/storage';
import { Ionicons } from '@expo/vector-icons';
import { type SessionState, formatLastSeen, vibingMessages } from '@/utils/sessionUtils';
import { Avatar } from './Avatar';
import { ActiveSessionsGroupCompact } from './ActiveSessionsGroupCompact';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVisibleSessionListViewData } from '@/hooks/useVisibleSessionListViewData';
import { Typography } from '@/constants/Typography';
import { StatusDot } from './StatusDot';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useIsTablet } from '@/utils/responsive';
import { requestReview } from '@/utils/requestReview';
import { UpdateBanner } from './UpdateBanner';
import { layout } from './layout';
import { useNavigateToSession } from '@/hooks/useNavigateToSession';
import { SessionActionsAnchor, SessionActionsPopover } from './SessionActionsPopover';
import { useSessionActionAlert } from '@/hooks/useSessionQuickActions';
import { useSettingMutable } from '@/sync/storage';
import { useCongressRoster } from '@/hooks/useCongressRoster';
import { CongressSeat } from '@/sync/congressTypes';
import { congressIdentity } from '@/utils/congressIdentity';
import { WardenKnocksView, cardMatchesQuery } from './WardenKnocks';
import { useWarden } from '@/hooks/useWarden';
import { FeedUnreachable } from '@/components/HonestSignal';
import { VramGauge } from './VramGauge';
import { DiskGauge } from './DiskGauge';
import { ContextGauge } from './ContextGauge';
import { WorkerCard } from './WorkerCard';
import { t } from '@/text';

const stylesheet = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'stretch',
        backgroundColor: theme.colors.groupped.background,
    },
    contentContainer: {
        flex: 1,
        maxWidth: layout.maxWidth,
    },
    headerSection: {
        backgroundColor: theme.colors.groupped.background,
        paddingHorizontal: 24,
        paddingTop: 20,
        paddingBottom: 8,
    },
    headerText: {
        fontSize: 14,
        fontWeight: '600',
        color: theme.colors.groupped.sectionTitle,
        letterSpacing: 0.1,
        ...Typography.default('semiBold'),
    },
    projectGroup: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        backgroundColor: theme.colors.surface,
    },
    projectGroupTitle: {
        fontSize: 13,
        fontWeight: '600',
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
    projectGroupSubtitle: {
        fontSize: 11,
        color: theme.colors.textSecondary,
        marginTop: 2,
        ...Typography.default(),
    },
    sessionItem: {
        height: 88,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        backgroundColor: theme.colors.surface,
    },
    sessionItemContainer: {
        marginHorizontal: 16,
        marginBottom: 1,
        overflow: 'hidden',
    },
    sessionItemFirst: {
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
    },
    sessionItemLast: {
        borderBottomLeftRadius: 12,
        borderBottomRightRadius: 12,
    },
    sessionItemSingle: {
        borderRadius: 12,
    },
    sessionItemContainerFirst: {
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
    },
    sessionItemContainerLast: {
        borderBottomLeftRadius: 12,
        borderBottomRightRadius: 12,
        marginBottom: 12,
    },
    sessionItemContainerSingle: {
        borderRadius: 12,
        marginBottom: 12,
    },
    sessionItemSelected: {
        backgroundColor: theme.colors.surfaceSelected,
    },
    sessionContent: {
        flex: 1,
        marginLeft: 16,
        justifyContent: 'center',
    },
    sessionTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 2,
    },
    sessionTitle: {
        fontSize: 15,
        fontWeight: '500',
        flex: 1,
        ...Typography.default('semiBold'),
    },
    sessionTitleConnected: {
        color: theme.colors.text,
    },
    sessionTitleDisconnected: {
        color: theme.colors.textSecondary,
    },
    sessionSubtitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginBottom: 4,
    },
    sessionSubtitle: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        flexShrink: 1,
        ...Typography.default(),
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    statusDotContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        height: 16,
        marginTop: 2,
        marginRight: 4,
    },
    bottleneckGlyph: {
        marginRight: 4,
    },
    contextPct: {
        marginLeft: 'auto',
        paddingLeft: 8,
        fontSize: 11,
        ...Typography.default('semiBold'),
    },
    // LOUD-guard banner — a quiet-but-visible "the feed is broken, not empty" line.
    rosterUnreachable: {
        width: '100%',
        maxWidth: layout.maxWidth,
        alignSelf: 'center',
        paddingHorizontal: 16,
        paddingVertical: 6,
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        maxWidth: layout.maxWidth,
        alignSelf: 'center',
        marginHorizontal: 16,
        marginTop: 8,
        marginBottom: 4,
        paddingHorizontal: 10,
        paddingVertical: Platform.OS === 'web' ? 8 : 6,
        borderRadius: 10,
        backgroundColor: theme.colors.groupped.background,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.divider,
    },
    searchIcon: {
        opacity: 0.7,
    },
    searchInput: {
        flex: 1,
        fontSize: 14,
        color: theme.colors.text,
        ...Typography.default(),
    },
    searchClear: {
        padding: 2,
    },
    searchEmpty: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        textAlign: 'center',
        paddingVertical: 16,
        paddingHorizontal: 16,
        ...Typography.default(),
    },
    statusText: {
        fontSize: 12,
        fontWeight: '500',
        lineHeight: 16,
        ...Typography.default(),
    },
    avatarContainer: {
        position: 'relative',
        width: 48,
        height: 48,
    },
    draftIconContainer: {
        position: 'absolute',
        bottom: -2,
        right: -2,
        width: 18,
        height: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    draftIconOverlay: {
        color: theme.colors.textSecondary,
    },
    artifactsSection: {
        paddingHorizontal: 16,
        paddingBottom: 12,
        backgroundColor: theme.colors.groupped.background,
    },
    archiveToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingVertical: 16,
    },
    archiveToggleLine: {
        flex: 1,
        height: StyleSheet.hairlineWidth,
        backgroundColor: theme.colors.groupped.sectionTitle,
        opacity: 0.3,
    },
    archiveToggleText: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        paddingHorizontal: 12,
        ...Typography.default('semiBold'),
    },
}));

// Hearth Phase 0 — lift congress lanes into a "Hearthside" group at the top.
//
// Additive + non-destructive: when no session id matches the roster (the infra
// feed isn't live yet, or there simply are no congress seats), this returns the
// data untouched — zero behavior change. When matches exist, the matched session
// rows are moved out of their date/active groups into a single "Hearthside"
// section, and any section title left empty by the move is dropped. The JOIN is
// the JOIN key claudeSid === session.metadata.claudeSessionId (stable, daemon-
// independent), with cuid === session.id as a fallback. `congressIds` is the set
// of BOTH key spaces (see useCongressRoster's dual-key map).
function buildHearthsideViewData(
    data: SessionListViewItem[],
    roster: Map<string, CongressSeat>,
    workers: CongressSeat[],
): SessionListViewItem[] {
    if (roster.size === 0 && workers.length === 0) {
        return data;
    }

    // A row is a congress lane if EITHER key hits: claudeSid (primary) or cuid.
    const seatFor = (s: SessionRowData): CongressSeat | undefined =>
        (s.claudeSessionId != null ? roster.get(s.claudeSessionId) : undefined) ?? roster.get(s.id);
    const isCongress = (s: SessionRowData) => seatFor(s) != null;

    const congressRows: SessionListViewItem[] = [];
    const rest: SessionListViewItem[] = [];

    for (const item of data) {
        if (item.type === 'session') {
            if (isCongress(item.session)) {
                congressRows.push(item);
            } else {
                rest.push(item);
            }
            continue;
        }
        if (item.type === 'active-sessions') {
            // Pull any congress seats out of the compact active group and render
            // them as full Hearthside cards (so they get role/pedal + verdict).
            for (const s of item.sessions) {
                if (isCongress(s)) {
                    congressRows.push({ type: 'session', session: s });
                }
            }
            const remaining = item.sessions.filter((s) => !isCongress(s));
            if (remaining.length > 0) {
                rest.push({ type: 'active-sessions', sessions: remaining });
            }
            continue;
        }
        rest.push(item);
    }

    // #1 INTELLIGENT ORDERING (Carlos: "surface active/unhealthy/needs-you first, not
    // raw chronological cruft"). Sort the Hearthside lanes by health TIER — dead-incident
    // (red) → needs-attention (amber) → alive-healthy (green) → daemon-lost/idle-cold
    // (grey). Reuses congressHealthStatus so the order AGREES with the tile colors Carlos
    // sees (the red ones float up). Stable + calm, not jumpy: it keys off the slow-moving
    // health tier (verdict ALIVE vs cold already sorts active above idle), and Array.sort
    // is stable so ties keep arrival order.
    const rank = (item: SessionListViewItem): number => {
        if (item.type !== 'session') return 9;
        const seat = seatFor(item.session);
        if (!seat) return 8;
        const { color } = congressHealthStatus(seat);
        return color === HEALTH_RED ? 0 : color === HEALTH_AMBER ? 1 : color === HEALTH_GREEN ? 2 : 3;
    };
    congressRows.sort((a, b) => rank(a) - rank(b));

    // Worker rows (cuid:null) don't JOIN — they render as their own cards.
    const workerItems: SessionListViewItem[] = workers.map((w) => ({ type: 'congress-worker', worker: w }));

    if (congressRows.length === 0 && workerItems.length === 0) {
        return data;
    }

    // Drop a section title (date header / project group) that the move left with
    // nothing beneath it — i.e. immediately followed by another title or the end.
    const cleanedRest: SessionListViewItem[] = [];
    for (let i = 0; i < rest.length; i++) {
        const item = rest[i];
        if (item.type === 'header' || item.type === 'project-group') {
            const next = rest[i + 1];
            if (!next || next.type === 'header' || next.type === 'project-group' || next.type === 'archive-toggle') {
                continue;
            }
        }
        cleanedRest.push(item);
    }

    return [
        { type: 'header', title: t('hearth.hearthside') },
        ...congressRows,
        ...workerItems,
        ...cleanedRest,
    ];
}

// Preview seam (dev only): inject the data + roster to exercise the REAL render
// path with fixture identities, without touching production behavior. Both props
// default to the live hooks, so an ordinary <SessionsList /> is unchanged.
export interface SessionsListProps {
    previewData?: SessionListViewItem[];
    previewRoster?: Map<string, CongressSeat>;
    previewWorkers?: CongressSeat[];
}

export function SessionsList({ previewData, previewRoster, previewWorkers }: SessionsListProps = {}) {
    const styles = stylesheet;
    const { theme } = useUnistyles();
    const safeArea = useSafeAreaInsets();
    // Hooks always run (stable hook order); preview props only swap the data source.
    const liveData = useVisibleSessionListViewData();
    const liveRoster = useCongressRoster();
    const data = previewData ?? liveData;
    const roster = previewRoster ?? liveRoster.sessions;
    const workers = previewWorkers ?? liveRoster.workers;
    // LOUD-guard: when the roster feed is persistently unreachable AND we have
    // nothing to show, say so loudly rather than render a silent blank (which would
    // be indistinguishable from a genuinely quiet congress — the masking bug). Copy
    // is a plain string pending loom's i18n pass (she owns the LOUD wording).
    const rosterUnreachable = !previewRoster && liveRoster.unreachable;
    // Project the congress roster onto the visible list: a Hearthside group at
    // the top (session-JOIN cards + worker cards). Untouched when both are empty.
    const viewData = React.useMemo(() => {
        if (!data) {
            return data;
        }
        return buildHearthsideViewData(data, roster, workers);
    }, [data, roster, workers]);
    // Find-as-you-type across the whole cockpit (lanes + cards). When a query is
    // active the list flattens to matching rows; the WardenKnocks header gets the
    // same query (filters its cards); the MONITOR gauges hide (search-context noise).
    const [query, setQuery] = React.useState('');
    const needle = query.trim().toLowerCase();
    const searching = needle.length > 0;
    const displayData = React.useMemo(() => {
        if (!searching || !viewData) return viewData;
        return viewData.filter((item) => viewItemMatchesQuery(item, roster, needle));
    }, [viewData, roster, needle, searching]);
    // Lift the Warden feed here (single poll, shared with the header view) so the
    // search empty-state counts BOTH planes — lanes AND cards. Without this the
    // 'no matches' line would lie when only folded answered cards matched.
    const warden = useWarden();
    const cardMatchCount = searching
        ? warden.items.filter((i) => cardMatchesQuery(i, needle)).length
        : 0;
    const pathname = usePathname();
    const isTablet = useIsTablet();
    const [hideInactiveSessions, setHideInactiveSessions] = useSettingMutable('hideInactiveSessions');
    const toggleArchived = React.useCallback(() => {
        setHideInactiveSessions(!hideInactiveSessions);
    }, [hideInactiveSessions, setHideInactiveSessions]);
    // Selection is derived once from pathname so the data array stays stable
    // across navigations. This keeps FlatList virtualization intact: only
    // the previously- and newly-selected rows re-render, instead of the
    // whole visible window.
    const selectedSessionId = React.useMemo<string | undefined>(() => {
        if (!isTablet) return undefined;
        if (!pathname.startsWith('/session/')) return undefined;
        return pathname.split('/')[2];
    }, [isTablet, pathname]);

    // Request review
    React.useEffect(() => {
        if (data && data.length > 0) {
            requestReview();
        }
    }, [data && data.length > 0]);

    // Early return if no data yet
    if (!data) {
        return (
            <View style={styles.container} />
        );
    }

    const keyExtractor = React.useCallback((item: SessionListViewItem, index: number) => {
        switch (item.type) {
            case 'header': return `header-${item.title}-${index}`;
            case 'active-sessions': return 'active-sessions';
            case 'archive-toggle': return 'archive-toggle';
            case 'project-group': return `project-group-${item.machine.id}-${item.displayPath}-${index}`;
            case 'session': return `session-${item.session.id}`;
            case 'congress-worker': return `worker-${item.worker.seat}`;
        }
    }, []);

    const renderItem = React.useCallback(({ item, index }: { item: SessionListViewItem, index: number }) => {
        switch (item.type) {
            case 'header':
                return (
                    <View style={styles.headerSection}>
                        <Text style={styles.headerText}>
                            {item.title}
                        </Text>
                    </View>
                );

            case 'archive-toggle':
                return (
                    <Pressable style={styles.archiveToggle} onPress={toggleArchived}>
                        <View style={styles.archiveToggleLine} />
                        <Text style={styles.archiveToggleText}>
                            {item.hidden ? t('sidebar.showArchived') : t('sidebar.hideArchived')}
                        </Text>
                        <View style={styles.archiveToggleLine} />
                    </Pressable>
                );

            case 'active-sessions':
                return (
                    <ActiveSessionsGroupCompact
                        sessions={item.sessions}
                        selectedSessionId={selectedSessionId}
                        roster={roster}
                    />
                );

            case 'project-group':
                return (
                    <View style={styles.projectGroup}>
                        <Text style={styles.projectGroupTitle}>
                            {item.displayPath}
                        </Text>
                        <Text style={styles.projectGroupSubtitle}>
                            {item.machine.metadata?.displayName || item.machine.metadata?.host || item.machine.id}
                        </Text>
                    </View>
                );

            case 'congress-worker':
                // A worker is watched, not conversable — a self-contained card.
                return <WorkerCard worker={item.worker} />;

            case 'session':
                // Determine card styling based on position within date group
                const prevItem = index > 0 ? viewData![index - 1] : null;
                const nextItem = index < viewData!.length - 1 ? viewData![index + 1] : null;

                const isFirst = prevItem?.type === 'header';
                const isLast = nextItem?.type === 'header' || nextItem == null || nextItem?.type === 'active-sessions';
                const isSingle = isFirst && isLast;
                const selected = item.session.id === selectedSessionId;

                return (
                    <SessionItem
                        session={item.session}
                        congressSeat={(item.session.claudeSessionId != null ? roster.get(item.session.claudeSessionId) : undefined) ?? roster.get(item.session.id)}
                        selected={selected}
                        isFirst={isFirst}
                        isLast={isLast}
                        isSingle={isSingle}
                    />
                );
        }
    }, [selectedSessionId, viewData, roster, toggleArchived]);


    // Remove this section as we'll use FlatList for all items now


    const HeaderComponent = React.useCallback(() => {
        return (
            <>
                {/* The Warden's notes on the mantel — renders nothing when empty.
                    During a search it filters its cards to the same query. Fed the
                    lifted items so the cockpit's empty-state counts cards too. */}
                <WardenKnocksView
                    items={warden.items}
                    unreachable={warden.unreachable}
                    query={searching ? needle : undefined}
                />
                {/* MONITOR pillar: the resilience gauges (loom owns final placement/feel).
                    Hidden during a search — they're noise when hunting a lane/card. */}
                {!searching ? (
                    <>
                        <ContextGauge />
                        <VramGauge />
                        <DiskGauge />
                        <UpdateBanner />
                    </>
                ) : null}
            </>
        );
    }, [searching, needle, warden.items, warden.unreachable]);

    // Footer removed - all sessions now shown inline

    return (
        <View style={styles.container}>
            <View style={styles.contentContainer}>
                {/* Sticky find-as-you-type — stays put while the results scroll. */}
                <View style={styles.searchBar}>
                    <Ionicons name="search" size={16} color={theme.colors.textSecondary} style={styles.searchIcon} />
                    <TextInput
                        style={styles.searchInput}
                        value={query}
                        onChangeText={setQuery}
                        placeholder={t('sessionsList.searchPlaceholder')}
                        placeholderTextColor={theme.colors.textSecondary}
                        returnKeyType="search"
                        autoCapitalize="none"
                        autoCorrect={false}
                        clearButtonMode="while-editing"
                    />
                    {searching ? (
                        <Pressable onPress={() => setQuery('')} hitSlop={8} style={styles.searchClear}>
                            <Ionicons name="close-circle" size={16} color={theme.colors.textSecondary} />
                        </Pressable>
                    ) : null}
                </View>
                {rosterUnreachable ? (
                    <View style={styles.rosterUnreachable}>
                        <FeedUnreachable message="can’t reach the congress right now" />
                    </View>
                ) : null}
                {searching && displayData && displayData.length === 0 && cardMatchCount === 0 ? (
                    <Text style={styles.searchEmpty}>{t('sessionsList.searchEmpty', { query: query.trim() })}</Text>
                ) : null}
                <FlatList
                    data={displayData}
                    renderItem={renderItem}
                    keyExtractor={keyExtractor}
                    extraData={selectedSessionId}
                    contentContainerStyle={{ paddingBottom: safeArea.bottom + 128, maxWidth: layout.maxWidth }}
                    ListHeaderComponent={HeaderComponent}
                    windowSize={5}
                    maxToRenderPerBatch={8}
                    initialNumToRender={12}
                />
            </View>
        </View>
    );
}

const STATUS_CONFIG: Record<SessionState, { color: string; dotColor: string; isPulsing: boolean; isConnected: boolean }> = {
    disconnected: { color: '#999', dotColor: '#999', isPulsing: false, isConnected: false },
    thinking: { color: '#007AFF', dotColor: '#007AFF', isPulsing: true, isConnected: true },
    waiting: { color: '#34C759', dotColor: '#34C759', isPulsing: false, isConnected: true },
    permission_required: { color: '#FF9500', dotColor: '#FF9500', isPulsing: true, isConnected: true },
};

// Phase 1 OVERSEE — health → color (loom's universal red/amber/green/grey, same
// semantics as every gauge). Derived honestly from the oracle verdict, refined by
// `health`/`bottleneck` when present (dark-safe: verdict-only until they emit):
//   green = ALIVE + healthy · amber = needs-attention (WEDGED / blocked-downstream
//   / degrading) · red = dead-incident · grey = DAEMON-LOST / idle-cold / unknown
//   (honest-not-alarming, fail-closed). Boring-when-healthy: calm green by default.
const HEALTH_GREEN = '#34C759';
const HEALTH_AMBER = '#FF9500';
const HEALTH_RED = '#E5484D';
const HEALTH_GREY = '#999';
// Score scale is oracle-defined (loom/infra to confirm); we treat it as 0..1 with
// a low-band amber, and ONLY refine — never override the honest verdict tier.
const HEALTH_AMBER_BELOW = 0.5;

function congressHealthStatus(seat: CongressSeat): { color: string; dotColor: string; isPulsing: boolean; isConnected: boolean } {
    const v = seat.verdict.trim().toUpperCase();
    const mk = (color: string, isConnected: boolean) => ({ color, dotColor: color, isPulsing: false, isConnected });
    if (v === 'ALIVE') {
        const lowScore = seat.health?.score != null && seat.health.score < HEALTH_AMBER_BELOW;
        const blocked = seat.bottleneck?.direction === 'blocked-downstream';
        return mk(lowScore || blocked ? HEALTH_AMBER : HEALTH_GREEN, true);
    }
    if (v === 'WEDGED') return mk(HEALTH_AMBER, true);
    if (v.includes('DEAD') || v.includes('INCIDENT') || v.includes('CRASH')) return mk(HEALTH_RED, false);
    // DAEMON-LOST / idle-cold / stale / unknown vocab → grey, fail-closed.
    return mk(HEALTH_GREY, false);
}

// Phase 1 OVERSEE — the thought-line (the warmth lever). Voices the oracle's raw
// ground-truth signals per loom's rules: currentWork (a real activity phrase) →
// an honest pedal fallback ('on the unifying surface'). We deliberately do NOT
// distill `lastAssistantText` yet — an honest pedal beats a confabulated line
// (loom's call; revisit with her once it lights up). Honest-staleness: a lane
// that isn't liveness-fresh never shows a present-tense "thought" — it reads
// "(quiet — last: …)", greyed, never a frozen-fresh lie.
// A thought older than this reads stale (amber/idle) — idle != busy, enforced at
// the voice layer so a lane that said something an hour ago never looks busy now.
const THOUGHT_STALE_MS = 3 * 60 * 1000;

// R1 specificity: distill a raw assistant turn into a short thought — the first
// concrete clause, capped at ~10 words. Never a bare gerund / slug-echo. (v0
// heuristic; loom owns richer distillation + the final voice.)
function distillThought(raw: string): string {
    const text = raw.trim().replace(/\s+/g, ' ');
    const firstClause = text.split(/(?<=[.!?])\s|\s—\s|:\s/)[0] ?? text;
    const words = firstClause.split(' ');
    return words.length > 10 ? `${words.slice(0, 10).join(' ')}…` : firstClause;
}

// voiceThought (loom's spec, R1–R4). The thought-line is DERIVED from the oracle's
// raw signals, never an asserted phrase that can drift stale-and-lying:
//   R1 distill lastAssistantText -> a specific short thought;
//   R2 staleness: age the thought off its ts — a stale/idle lane reads quiet, not busy;
//   R3 privacy fence: voice raw text ONLY when renderSafe===true (fail-closed);
//   R4 ladder: currentWork(fresh) > distilled-safe-text(fresh) > dim slug/role.
function voiceThought(seat: CongressSeat): { text: string; stale: boolean } {
    // Fail-closed identity fence (#0): a collided seat's transcript may be a foreign
    // lane's — never voice a thought we can't attribute.
    if (seat.joinCollision) return { text: 'identity unverified', stale: true };

    const alive = seat.verdict.trim().toUpperCase() === 'ALIVE';
    const work = seat.currentWork?.trim() || null;
    // R3: only distill when the oracle says it's render-safe (fail-closed: false/absent => redact).
    const safeText = (seat.renderSafe === true && seat.lastAssistantText)
        ? distillThought(seat.lastAssistantText)
        : null;
    // R2: how old is the assistant turn?
    const ageMs = seat.lastTextTs != null ? Date.now() - seat.lastTextTs : null;
    const freshText = ageMs != null && ageMs < THOUGHT_STALE_MS;
    const ageMin = ageMs != null ? Math.max(1, Math.round(ageMs / 60000)) : null;
    const slug = seat.pedal?.trim() ? `on ${seat.pedal.trim().replace(/-/g, ' ')}` : (seat.role?.trim() || null);

    // Not alive -> quiet, never a present-tense thought.
    if (!alive) {
        const last = work || safeText || slug;
        return { text: last ? `quiet — last: ${last}` : 'quiet', stale: true };
    }
    // R4 ladder (alive): a deliberate currentWork phrase wins; else a fresh safe distill.
    if (work) return { text: work, stale: !freshText };
    if (safeText && freshText) return { text: safeText, stale: false };
    if (safeText) return { text: ageMin ? `${safeText} · ${ageMin}m ago` : safeText, stale: true };
    // No voiceable signal. If we know the turn age, say idle honestly; else the
    // dim slug fallback (tentative — a non-signal, rendered stale so it reads dim).
    if (ageMin != null) return { text: `idle ~${ageMin}m`, stale: true };
    return { text: slug ?? 'idle', stale: true };
}

// Phase 1→2 (bounded cut): the OVERSEE context-pressure cue. contextFill (tokens)
// rendered as a % toward the 750K auto-compact fire — the first MONITOR signal on
// the tile, so Carlos can watch lanes climb toward their fire. Restrained: muted by
// default, ambers/reds only as the pressure is earned. Dark-safe (null when absent).
// Find-as-you-type matcher: with 12+ lanes the roster is untenable to scan, so the
// cockpit search box flattens to matching rows. A 'session' matches on its name/
// subtitle/path + its joined congress seat (seat/role/pedal); a worker on seat/role/
// currentWork. Headers/groups/toggles drop during search (results, not the browse view).
function viewItemMatchesQuery(item: SessionListViewItem, roster: Map<string, CongressSeat>, needle: string): boolean {
    if (item.type === 'session') {
        const s = item.session;
        const seat = (s.claudeSessionId != null ? roster.get(s.claudeSessionId) : undefined) ?? roster.get(s.id);
        return [s.name, s.subtitle, s.path, seat?.seat, seat?.role, seat?.pedal]
            .filter(Boolean).join(' ').toLowerCase().includes(needle);
    }
    if (item.type === 'congress-worker') {
        const w = item.worker;
        return [w.seat, w.role, w.currentWork].filter(Boolean).join(' ').toLowerCase().includes(needle);
    }
    return false;
}

const CONTEXT_FIRE_TOKENS = 750_000;
function contextPressure(seat: CongressSeat): { label: string; color: string } | null {
    // Fail-closed: a collided seat's contextFill is another lane's number — don't
    // render a pressure pill we can't attribute (the oracle already nulls it, but
    // guard explicitly so a render-order change can't leak the lie).
    if (seat.joinCollision) return null;
    if (seat.contextFill == null) return null;
    const pct = Math.round((seat.contextFill / CONTEXT_FIRE_TOKENS) * 100);
    const color = pct >= 90 ? HEALTH_RED : pct >= 75 ? HEALTH_AMBER : '#999';
    return { label: `${pct}%`, color };
}

const SessionItem = React.memo(({ session, congressSeat, selected, isFirst, isLast, isSingle }: {
    session: SessionRowData;
    congressSeat?: CongressSeat;
    selected?: boolean;
    isFirst?: boolean;
    isLast?: boolean;
    isSingle?: boolean;
}) => {
    const styles = stylesheet;
    const navigateToSession = useNavigateToSession();
    const [actionsAnchor, setActionsAnchor] = React.useState<SessionActionsAnchor | null>(null);
    const baseStatus = STATUS_CONFIG[session.state];
    // Override to solid blue when session has unread results
    const status = congressSeat
        // Congress lane: health → color (verdict tiers refined by health/bottleneck).
        ? congressHealthStatus(congressSeat)
        : session.hasUnread
            ? { ...baseStatus, color: '#007AFF', dotColor: '#007AFF', isPulsing: false, isConnected: baseStatus.isConnected }
            : baseStatus;

    const vibingMessage = React.useMemo(() => {
        return vibingMessages[Math.floor(Math.random() * vibingMessages.length)].toLowerCase() + '…';
    }, [session.state]);

    // Phase 1: the congress status line is the voiced THOUGHT-LINE (the warmth
    // lever) — what the lane is doing now, honest-stale when not liveness-fresh.
    const congressThought = congressSeat ? voiceThought(congressSeat) : null;
    const pressure = congressSeat ? contextPressure(congressSeat) : null;
    const statusText = congressSeat
        ? congressThought!.text
        : session.hasUnread
        ? t('status.unread')
        : session.state === 'thinking'
            ? vibingMessage
            : session.state === 'disconnected'
                ? t('status.lastSeen', { time: formatLastSeen(session.activeAt!, false) })
                : session.state === 'permission_required'
                    ? t('status.permissionRequired')
                    : t('status.online');

    const handlePress = React.useCallback(() => {
        navigateToSession(session.id);
    }, [navigateToSession, session.id]);

    const handleContextMenu = React.useCallback((event: any) => {
        event.preventDefault?.();
        event.stopPropagation?.();
        setActionsAnchor({
            type: 'point',
            x: event.nativeEvent.clientX ?? event.nativeEvent.pageX ?? 0,
            y: event.nativeEvent.clientY ?? event.nativeEvent.pageY ?? 0,
        });
    }, []);

    const showActionAlert = useSessionActionAlert(session.id);
    const menuProps = Platform.OS === 'web' ? {
        onContextMenu: handleContextMenu,
    } as any : {
        onLongPress: showActionAlert,
    };

    return (
        <View style={[
            styles.sessionItemContainer,
            isSingle ? styles.sessionItemContainerSingle :
                isFirst ? styles.sessionItemContainerFirst :
                    isLast ? styles.sessionItemContainerLast : {}
        ]}>
        <Pressable
            style={[
                styles.sessionItem,
                selected && styles.sessionItemSelected,
                isSingle ? styles.sessionItemSingle :
                    isFirst ? styles.sessionItemFirst :
                        isLast ? styles.sessionItemLast : {}
            ]}
            onPress={handlePress}
            {...menuProps}
        >
            <View style={styles.avatarContainer}>
                {/* Phase 1: congress rows key the avatar by the stable SEAT name, not
                    the session id — so a lane keeps the same face across re-registers
                    (new session ids), per loom's "stable one-face-per-lane". */}
                <Avatar id={congressSeat ? congressSeat.seat : session.avatarId} size={48} monochrome={!status.isConnected} flavor={session.flavor} />
                {session.hasDraft && (
                    <View style={styles.draftIconContainer}>
                        <Ionicons
                            name="create-outline"
                            size={12}
                            style={styles.draftIconOverlay}
                        />
                    </View>
                )}
            </View>
            <View style={styles.sessionContent}>
                <View style={styles.sessionTitleRow}>
                    <Text style={[
                        styles.sessionTitle,
                        status.isConnected ? styles.sessionTitleConnected : styles.sessionTitleDisconnected
                    ]} numberOfLines={1}>
                        {session.name}
                    </Text>
                </View>

                {congressSeat ? (
                    <View style={styles.sessionSubtitleRow}>
                        <Text style={styles.sessionSubtitle} numberOfLines={1}>
                            {congressIdentity(congressSeat)}
                        </Text>
                    </View>
                ) : session.path ? (
                    <View style={styles.sessionSubtitleRow}>
                        <Text style={styles.sessionSubtitle} numberOfLines={1}>
                            {session.path.split(/[/\\]/).filter(Boolean).pop()}
                        </Text>
                    </View>
                ) : (
                    <Text style={styles.sessionSubtitle} numberOfLines={1}>
                        {session.subtitle}
                    </Text>
                )}

                <View style={styles.statusRow}>
                    <View style={styles.statusDotContainer}>
                        <StatusDot color={status.dotColor} isPulsing={status.isPulsing} />
                    </View>
                    {/* Phase 1: directional Bottleneck light — a glyph whose SHAPE
                        carries direction (down = blocked-downstream / up = starved-
                        upstream), so it never double-reads against the health color.
                        Dark-safe + fail-closed: only when bottleneck is present and
                        not 'working'. */}
                    {congressSeat?.bottleneck && congressSeat.bottleneck.direction !== 'working' ? (
                        <Ionicons
                            name={congressSeat.bottleneck.direction === 'blocked-downstream' ? 'arrow-down' : 'arrow-up'}
                            size={12}
                            color={status.color}
                            style={styles.bottleneckGlyph}
                        />
                    ) : null}
                    <Text style={[
                        styles.statusText,
                        { color: status.color }
                    ]}>
                        {statusText}
                    </Text>
                    {/* OVERSEE context-pressure cue: % toward the 750K auto-compact
                        fire (the first MONITOR signal on the tile). Right-aligned,
                        muted until the pressure earns amber/red. */}
                    {pressure ? (
                        <Text style={[styles.contextPct, { color: pressure.color }]}>
                            {pressure.label}
                        </Text>
                    ) : null}
                </View>
            </View>
        </Pressable>
        {Platform.OS === 'web' && (
            <SessionActionsPopover
                anchor={actionsAnchor}
                onClose={() => setActionsAnchor(null)}
                sessionId={session.id}
                visible={!!actionsAnchor}
            />
        )}
        </View>
    );
});
