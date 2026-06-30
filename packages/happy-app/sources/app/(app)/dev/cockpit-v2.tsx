import * as React from 'react';
import { View, TextInput, Pressable, ScrollView } from 'react-native';
import { Text } from '@/components/StyledText';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { layout } from '@/components/layout';
import { useWarden } from '@/hooks/useWarden';
import { WardenItem } from '@/sync/wardenTypes';
import { answerWarden } from '@/sync/apiWarden';
import { TokenStorage } from '@/auth/tokenStorage';
import { FeedUnreachable } from '@/components/HonestSignal';

// Cockpit v2 — STAGED card-STATE render (the munder "two planes, one renderer"
// reframe). DEV ROUTE, not wired into Carlos's live surface: it reads the SAME
// for-carlos store via useWarden, but renders from DERIVED card state instead of
// the bucket-move model. Cutover = pointing the live cockpit at this render path
// once loom blesses the feel + desk gets Carlos's GO. Dev page → i18n-exempt.
//
// The principle this cut exists for: the render is a PURE FUNCTION of canonical
// card fields. State is DERIVED, never stamped (a stamped enum drifts = the
// asserted-lie this whole reframe kills):
//   open      = no answer AND not withdrawn  (waitsOnHuman — the NEEDS-YOU set)
//   answered  = has an answer
//   withdrawn = has withdrawn_ts             (superseded ≠ live)
// Answering writes the answer ON the card (optimistic) and the card transitions
// IN PLACE — it never jumps to a separate ANSWERED list (no scroll-yank, the
// decision stays in context). The derived filter drops it on the next poll.

const ACCENT_GATE = '#E5484D';
const ACCENT_ROUTINE = '#9B7EDE';
const GREEN = '#34C759';

const isWithdrawn = (i: WardenItem) => !!i.withdrawn_ts;
const isAnswered = (i: WardenItem) => !!i.a;
// waitsOnHuman: the derived NEEDS-YOU predicate — open = no answer, not withdrawn.
const waitsOnHuman = (i: WardenItem) => !isAnswered(i) && !isWithdrawn(i);

// Cascade: how many OTHER cards declare this card in their dependsOn — i.e. how
// many downstream asks this gate is blocking. Derived live from the edges; value
// materializes as lanes adopt --depends-on (dark until then).
function blockingCount(card: WardenItem, all: WardenItem[]): number {
    return all.filter((other) => other.id !== card.id && (other.dependsOn ?? []).includes(card.id) && waitsOnHuman(other)).length;
}

function firstLine(q: string): string {
    const lines = (q ?? '').trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return lines[0] ?? (q ?? '').trim();
}

function V2Card({ item, all, optimistic, onAnswer }: {
    item: WardenItem;
    all: WardenItem[];
    optimistic?: string;
    onAnswer: (id: string, text: string) => void;
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
        <View style={[styles.card, { borderLeftColor: settled ? GREEN : accent }, settled && styles.cardSettled]}>
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
                // In-place settle: the card stays put + shows the warm ack. It drops
                // from NEEDS-YOU on the next poll (derived), not with a jarring yank.
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
                </View>
            )}
        </View>
    );
}

export default function CockpitV2() {
    const { items, unreachable } = useWarden();
    // Optimistic answers (id -> text); reconciled by the next poll. The card stays
    // rendered in place while optimistic, so there's no scroll-yank on answer.
    const [overlay, setOverlay] = React.useState<Record<string, string>>({});

    const onAnswer = React.useCallback(async (id: string, text: string) => {
        setOverlay((o) => ({ ...o, [id]: text }));
        const creds = await TokenStorage.getCredentials();
        const res = creds ? await answerWarden(creds, id, text) : { ok: false, authExpired: false };
        if (!res.ok) {
            setOverlay((o) => { const n = { ...o }; delete n[id]; return n; });
        }
    }, []);

    // NEEDS-YOU = derived filter (waitsOnHuman) + any card answered THIS session
    // (kept in place so the answer settles visibly instead of vanishing). Gates
    // with the largest blast-radius float up; then oldest-first within tier.
    const needsYou = React.useMemo(() => {
        const visible = items.filter((i) => waitsOnHuman(i) || overlay[i.id]);
        return visible.slice().sort((a, b) => {
            const ab = blockingCount(a, items);
            const bb = blockingCount(b, items);
            if (ab !== bb) return bb - ab;
            return (a.ts ?? '').localeCompare(b.ts ?? '');
        });
    }, [items, overlay]);

    // Count GENUINELY-open cards (exclude just-answered optimistic settles) so the
    // header decrements the instant you answer, while the card itself stays visible
    // settling in place. needsYou keeps the settling card; openCount drops it.
    const openCount = needsYou.filter((i) => !overlay[i.id]).length;

    return (
        <ScrollView contentContainerStyle={styles.scroll}>
            <View style={styles.container}>
                <Text style={styles.title}>NEEDS YOU{openCount > 0 ? ` · ${openCount}` : ''}</Text>

                {unreachable && needsYou.length === 0 ? (
                    <FeedUnreachable message="can’t reach the Warden — answers won’t send" />
                ) : needsYou.length === 0 ? (
                    <Text style={styles.empty}>Nothing needs you right now 🌿</Text>
                ) : (
                    needsYou.map((item) => (
                        <V2Card
                            key={item.id}
                            item={item}
                            all={items}
                            optimistic={overlay[item.id]}
                            onAnswer={onAnswer}
                        />
                    ))
                )}
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
    title: {
        fontSize: 13,
        color: theme.colors.groupped.sectionTitle,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 10,
        marginLeft: 4,
        ...Typography.default('semiBold'),
    },
    empty: {
        fontSize: 14,
        color: theme.colors.textSecondary,
        textAlign: 'center',
        paddingVertical: 40,
        ...Typography.default(),
    },
    card: {
        backgroundColor: theme.colors.surface,
        borderRadius: 12,
        borderLeftWidth: 3,
        paddingVertical: 12,
        paddingHorizontal: 14,
        marginBottom: 8,
    },
    cardSettled: {
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
