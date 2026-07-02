import * as React from 'react';
import { View, TextInput, Pressable } from 'react-native';
import { Text } from '@/components/StyledText';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { StatusDot } from '@/components/StatusDot';
import { FeedUnreachable } from '@/components/HonestSignal';
import { useWarden } from '@/hooks/useWarden';
import { WardenItem } from '@/sync/wardenTypes';
import { answerWarden } from '@/sync/apiWarden';
import { TokenStorage } from '@/auth/tokenStorage';
import { useAuth } from '@/auth/AuthContext';
import { ACCENT_GATE, ACCENT_ROUTINE, GREEN, GREY } from '../colors';
import { useDensity, scaled } from '../density';

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

export function NeedsYouPlane() {
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

const styles = StyleSheet.create((theme) => ({
    plane: {
        marginBottom: 24,
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
}));
