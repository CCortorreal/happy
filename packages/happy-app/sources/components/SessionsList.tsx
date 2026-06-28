import React from 'react';
import { View, Pressable, FlatList, Platform } from 'react-native';
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
import { StyleSheet } from 'react-native-unistyles';
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
import { WardenKnocks } from './WardenKnocks';
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
// the locked invariant cuid === session.id.
function buildHearthsideViewData(
    data: SessionListViewItem[],
    congressIds: Set<string>,
    workers: CongressSeat[],
): SessionListViewItem[] {
    if (congressIds.size === 0 && workers.length === 0) {
        return data;
    }

    const congressRows: SessionListViewItem[] = [];
    const rest: SessionListViewItem[] = [];

    for (const item of data) {
        if (item.type === 'session') {
            if (congressIds.has(item.session.id)) {
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
                if (congressIds.has(s.id)) {
                    congressRows.push({ type: 'session', session: s });
                }
            }
            const remaining = item.sessions.filter((s) => !congressIds.has(s.id));
            if (remaining.length > 0) {
                rest.push({ type: 'active-sessions', sessions: remaining });
            }
            continue;
        }
        rest.push(item);
    }

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
    const safeArea = useSafeAreaInsets();
    // Hooks always run (stable hook order); preview props only swap the data source.
    const liveData = useVisibleSessionListViewData();
    const liveRoster = useCongressRoster();
    const data = previewData ?? liveData;
    const roster = previewRoster ?? liveRoster.sessions;
    const workers = previewWorkers ?? liveRoster.workers;
    // Project the congress roster onto the visible list: a Hearthside group at
    // the top (session-JOIN cards + worker cards). Untouched when both are empty.
    const viewData = React.useMemo(() => {
        if (!data) {
            return data;
        }
        return buildHearthsideViewData(data, new Set(roster.keys()), workers);
    }, [data, roster, workers]);
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
                        congressSeat={roster.get(item.session.id)}
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
                {/* The Warden's notes on the mantel — renders nothing when empty. */}
                <WardenKnocks />
                <UpdateBanner />
            </>
        );
    }, []);

    // Footer removed - all sessions now shown inline

    return (
        <View style={styles.container}>
            <View style={styles.contentContainer}>
                <FlatList
                    data={viewData}
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

// Congress liveness from the oracle verdict — derived-fail-closed (#170): a lane
// reads ALIVE only when the verdict says so explicitly; everything else (DAEMON-
// LOST, PID-DEAD, stale, unknown vocab) FAILS CLOSED to a dead/grey window. This
// replaces the Session model's lying 15-min `active` flag for congress rows.
function congressVerdictStatus(verdict: string): { color: string; dotColor: string; isPulsing: boolean; isConnected: boolean } {
    const alive = verdict.trim().toUpperCase() === 'ALIVE';
    return alive
        ? { color: '#34C759', dotColor: '#34C759', isPulsing: false, isConnected: true }
        : { color: '#999', dotColor: '#999', isPulsing: false, isConnected: false };
}

// The Hearthside identity line: role, with the pedal (the lane's current thread)
// appended when present — e.g. "BUILD lane · happy-dev".
function congressIdentity(seat: CongressSeat): string {
    const role = seat.role?.trim();
    const pedal = seat.pedal?.trim();
    if (role && pedal) return `${role} · ${pedal}`;
    return role || pedal || seat.seat;
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
        // Congress lane: liveness is the oracle verdict, NOT session.state.
        ? congressVerdictStatus(congressSeat.verdict)
        : session.hasUnread
            ? { ...baseStatus, color: '#007AFF', dotColor: '#007AFF', isPulsing: false, isConnected: baseStatus.isConnected }
            : baseStatus;

    const vibingMessage = React.useMemo(() => {
        return vibingMessages[Math.floor(Math.random() * vibingMessages.length)].toLowerCase() + '…';
    }, [session.state]);

    const statusText = congressSeat
        // The trustworthy verdict, shown as the status line (oracle data, warm-cased).
        ? congressSeat.verdict.trim().toLowerCase()
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
                <Avatar id={session.avatarId} size={48} monochrome={!status.isConnected} flavor={session.flavor} />
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
                    <Text style={[
                        styles.statusText,
                        { color: status.color }
                    ]}>
                        {statusText}
                    </Text>
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
