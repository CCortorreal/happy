import * as React from 'react';
import { View, TextInput, Pressable } from 'react-native';
import { Text } from '@/components/StyledText';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { layout } from './layout';
import { useWarden } from '@/hooks/useWarden';
import { WardenItem } from '@/sync/wardenTypes';
import { answerWarden } from '@/sync/apiWarden';
import { TokenStorage } from '@/auth/tokenStorage';
import { t } from '@/text';

// WardenKnocks — Hearth P1 RELATE + Slice A (answering).
//
// Renders the Warden's for-carlos asks as knock-cards (notes a person left, never
// alerts) and lets Carlos REPLY to them in-UI. Answering = replying to a note, not
// operating a console (loom's interaction contract):
//   - inline affordance ON the card (never a modal/popped form);
//   - universal pair: affirm / decline + a one-line quick-reply (Enter sends);
//     tap-a-choice is `choices`-gated and degrades to quick-reply (no field yet);
//   - never auto-select; the lane's recommendation rides in the prose, not a default;
//   - on answer: optimistic settle (the card eases into answered-resting, dimmed,
//     sinks below open gates, never re-gates) + a warm acknowledgment;
//   - the client NEVER writes the file — it POSTs to the server, which routes the
//     answer through the for-carlos.mjs verb (write + channel route-back to the lane);
//   - keep the draft on failure: a quiet "couldn't send — retry", never a lost reply.
//
// Manners (render spec): render NOTHING when empty; never steal focus; gate = red
// left-edge (blocks), routine = lilac (optional).

const ACCENT_GATE = '#E5484D';
const ACCENT_ROUTINE = '#9B7EDE';

function KnockCard({ item, optimisticAnswer, errored, onAnswer }: {
    item: WardenItem;
    optimisticAnswer?: string;
    errored?: boolean;
    onAnswer: (id: string, text: string) => void;
}) {
    const { theme } = useUnistyles();
    const effectiveAnswer = item.a ?? optimisticAnswer ?? null;
    const answered = !!effectiveAnswer;
    const isGate = (item.kind ?? '').toLowerCase() === 'gate';
    const accent = isGate ? ACCENT_GATE : ACCENT_ROUTINE;

    // Draft is held until the answer is confirmed (the card flips to answered) — so a
    // failed send never loses what Carlos typed.
    const [draft, setDraft] = React.useState('');

    const submit = (text: string) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        onAnswer(item.id, trimmed);
    };

    // Affirm carries the draft as a caveat when present ("Yes — go ahead. <note>").
    const submitAffirm = () => submit(draft.trim() ? `${t('warden.affirm')} — ${draft.trim()}` : t('warden.affirm'));

    // Tap-a-choice: present only when a lane has structured its options (reaper's
    // A/B first). Absent -> the universal affirm/decline + quick-reply pair. Never
    // auto-selected; the recommendation is a quiet cue, not a default.
    const choices = item.choices ?? [];
    const hasChoices = choices.length > 0;
    const recommended = choices.find((c) => c.recommended);

    return (
        <View style={[styles.card, { borderLeftColor: accent }, answered && styles.cardAnswered]}>
            <View style={styles.headerRow}>
                <Text style={styles.sender} numberOfLines={1}>
                    {t('warden.from', { name: item.from })}
                </Text>
                <View style={[styles.kindChip, { backgroundColor: accent }]}>
                    <Text style={styles.kindChipText}>
                        {isGate ? t('warden.gate') : t('warden.routine')}
                    </Text>
                </View>
                {answered && (
                    <Text style={styles.answeredLabel}>{t('warden.answered')}</Text>
                )}
            </View>

            <Text style={styles.ask}>{item.q}</Text>

            {item.ctx ? (
                <Text style={styles.ctx}>{item.ctx}</Text>
            ) : null}

            {answered ? (
                <>
                    <Text style={styles.answer} numberOfLines={3}>{effectiveAnswer}</Text>
                    <Text style={styles.ack}>{t('warden.acknowledged', { to: item.from })}</Text>
                </>
            ) : (
                <View style={styles.replyArea}>
                    {hasChoices ? (
                        <>
                            <View style={styles.replyButtons}>
                                {choices.map((c) => (
                                    <Pressable
                                        key={c.key}
                                        style={[styles.btn, c.recommended ? styles.btnChoiceRec : styles.btnChoice]}
                                        onPress={() => submit(c.label)}
                                    >
                                        <Text style={styles.btnChoiceText}>{c.label}</Text>
                                    </Pressable>
                                ))}
                            </View>
                            {recommended ? (
                                <Text style={styles.recommendCue}>
                                    {t('warden.recommends', { name: item.from, choice: recommended.label })}
                                </Text>
                            ) : null}
                        </>
                    ) : null}

                    <TextInput
                        style={styles.input}
                        value={draft}
                        onChangeText={setDraft}
                        placeholder={t('warden.replyPlaceholder')}
                        placeholderTextColor={theme.colors.textSecondary}
                        onSubmitEditing={() => submit(draft)}
                        returnKeyType="send"
                        blurOnSubmit={false}
                    />

                    {!hasChoices ? (
                        <View style={styles.replyButtons}>
                            <Pressable style={[styles.btn, styles.btnAffirm]} onPress={submitAffirm}>
                                <Text style={styles.btnAffirmText}>{t('warden.affirm')}</Text>
                            </Pressable>
                            <Pressable style={[styles.btn, styles.btnDecline]} onPress={() => submit(t('warden.decline'))}>
                                <Text style={styles.btnDeclineText}>{t('warden.decline')}</Text>
                            </Pressable>
                        </View>
                    ) : null}

                    {errored ? (
                        <Text style={styles.errorLine}>{t('warden.sendFailed')}</Text>
                    ) : null}
                </View>
            )}

            {item.ref ? (
                <Text style={styles.reference} numberOfLines={1}>
                    {t('warden.reference')}: {item.ref}
                </Text>
            ) : null}
        </View>
    );
}

export function WardenKnocks() {
    const items = useWarden();
    // Optimistic answers (id -> text) shown immediately; reconciled by the next poll
    // once the server's write lands. Cleared if the POST fails (with a retry hint).
    const [overlay, setOverlay] = React.useState<Record<string, string>>({});
    const [errors, setErrors] = React.useState<Record<string, boolean>>({});

    const onAnswer = React.useCallback(async (id: string, text: string) => {
        setErrors((e) => ({ ...e, [id]: false }));
        setOverlay((o) => ({ ...o, [id]: text }));   // optimistic settle
        const creds = await TokenStorage.getCredentials();
        const ok = creds ? await answerWarden(creds, id, text) : false;
        if (!ok) {
            // Revert the optimistic state, surface a quiet retry; the draft is still
            // in the card (we never cleared it), so nothing is lost.
            setOverlay((o) => {
                const next = { ...o };
                delete next[id];
                return next;
            });
            setErrors((e) => ({ ...e, [id]: true }));
        }
    }, []);

    if (items.length === 0) {
        return null;
    }

    // Open asks lead; answered (real or optimistic) settle below.
    const isAnswered = (i: WardenItem) => !!i.a || !!overlay[i.id];
    const ordered = [...items.filter((i) => !isAnswered(i)), ...items.filter(isAnswered)];

    return (
        <View style={styles.wrapper}>
            <View style={styles.container}>
                <Text style={styles.sectionTitle}>{t('warden.sectionTitle')}</Text>
                {ordered.map((item) => (
                    <KnockCard
                        key={item.id}
                        item={item}
                        optimisticAnswer={overlay[item.id]}
                        errored={errors[item.id]}
                        onAnswer={onAnswer}
                    />
                ))}
            </View>
        </View>
    );
}

const styles = StyleSheet.create((theme) => ({
    wrapper: {
        alignItems: 'center',
    },
    container: {
        width: '100%',
        maxWidth: layout.maxWidth,
        paddingHorizontal: 16,
        paddingTop: 12,
    },
    sectionTitle: {
        fontSize: 13,
        color: theme.colors.groupped.sectionTitle,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 8,
        marginLeft: 4,
        ...Typography.default('semiBold'),
    },
    card: {
        backgroundColor: theme.colors.surface,
        borderRadius: 12,
        borderLeftWidth: 3,
        paddingVertical: 12,
        paddingHorizontal: 14,
        marginBottom: 8,
    },
    cardAnswered: {
        opacity: 0.6,
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
    answeredLabel: {
        fontSize: 10,
        color: theme.colors.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 0.4,
        ...Typography.default('semiBold'),
    },
    ask: {
        fontSize: 15,
        color: theme.colors.text,
        lineHeight: 20,
        ...Typography.default(),
    },
    ctx: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        lineHeight: 18,
        marginTop: 6,
        ...Typography.default(),
    },
    answer: {
        fontSize: 13,
        color: theme.colors.text,
        lineHeight: 18,
        marginTop: 6,
        ...Typography.default(),
    },
    ack: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        marginTop: 4,
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
    btnChoice: {
        backgroundColor: 'transparent',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.divider,
    },
    btnChoiceRec: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: theme.colors.text,
    },
    btnChoiceText: {
        fontSize: 13,
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
    recommendCue: {
        fontSize: 11,
        color: theme.colors.textSecondary,
        marginTop: 6,
        fontStyle: 'italic',
        ...Typography.default(),
    },
    errorLine: {
        fontSize: 12,
        color: '#E5484D',
        marginTop: 6,
        ...Typography.default(),
    },
    reference: {
        fontSize: 11,
        color: theme.colors.textSecondary,
        marginTop: 6,
        ...Typography.default(),
    },
}));
