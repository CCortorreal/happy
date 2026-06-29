import * as React from 'react';
import { View, TextInput, Pressable } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Text } from '@/components/StyledText';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { layout } from './layout';
import { useWarden } from '@/hooks/useWarden';
import { WardenItem } from '@/sync/wardenTypes';
import { answerWarden } from '@/sync/apiWarden';
import { TokenStorage } from '@/auth/tokenStorage';
import { FeedUnreachable } from '@/components/HonestSignal';
import { t } from '@/text';

// WardenKnocks — Hearth P1 RELATE + Slice A (answering) + Tuning Round 1.
//
// Renders the Warden's for-carlos asks as knock-cards (notes a person left, never
// alerts) and lets Carlos REPLY to them in-UI. Answering = replying to a note, not
// operating a console (loom's interaction contract):
//   - inline affordance ON the card (never a modal/popped form);
//   - universal pair: affirm / decline + a one-line quick-reply (Enter sends);
//     tap-a-choice is `choices`-gated and degrades to quick-reply when absent;
//   - never auto-select; the lane's recommendation is a quiet cue, not a default;
//   - on answer: optimistic settle + a warm acknowledgment; never re-gates;
//   - the client NEVER writes the file — it POSTs to the server, which routes the
//     answer through the for-carlos.mjs verb (write + channel route-back to the lane);
//   - keep the draft on failure: a quiet "couldn't send — retry", never a lost reply.
//
// Tuning Round 1 (loom, from the overseer's live render-pass):
//   [1] OPEN-DEFAULT + ANSWERED-HISTORY FOLD — the active mantel shows OPEN asks
//       only (quiet when none open); answered cards collapse into an expandable
//       "answered" history (de-emphasize, never delete — the conversation record).
//   [2] DETAILS-FOLD — a command-dense ask (raw commands embedded in the prose)
//       tips a card from warm-note toward triage-console. The card stays a note at
//       rest (first lines = the plain-language ask) and folds the operational tail
//       behind a disclosure chevron. Content-agnostic (length/overflow), so it's
//       robust regardless of how a lane writes the ask.
//   [3] GROUP BY ref — asks that share a `ref` cluster visually (HIDE NOTHING; no
//       fuzzy similarity-guessing — only an exact ref match groups).
//
// Manners (render spec): render NOTHING when empty; never steal focus; gate = red
// left-edge (blocks), routine = lilac (optional).

const ACCENT_GATE = '#E5484D';
const ACCENT_ROUTINE = '#9B7EDE';

// Progressive disclosure (Carlos's "the mantel must scan in ~2s, not be a wall"): a
// knock rests as a tight HEADLINE + one-line summary; the full accreted body (the
// SAFE-ITEM / lockout-class / CHANGE / ROLLBACK / APPLIES walls a lane writes) folds
// behind expand-on-tap. Derived from `q` client-side — the lane doesn't author a title
// yet (flagged to warden as an optional title/summary field; dark-safe additive like
// choices/commands). Robust regardless of how the ask was written.
const SUMMARY_CLIP = 72;

function summarize(q: string): { headline: string; summary: string | null; body: string; hasMore: boolean } {
    const body = (q ?? '').trim();
    const lines = body.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
    const headline = lines[0] ?? body;
    const summary = lines.length > 1 ? lines[1] : null;
    const hasMore = lines.length > 2
        || headline.length > SUMMARY_CLIP
        || (summary != null && summary.length > SUMMARY_CLIP)
        || (summary == null && body.length > SUMMARY_CLIP);
    return { headline, summary, body, hasMore };
}

function KnockCard({ item, optimisticAnswer, errored, onAnswer }: {
    item: WardenItem;
    optimisticAnswer?: string;
    errored?: 'auth' | 'send';
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

    // Details fold: the ask rests as a note (REST_LINES); the operational tail folds
    // behind a chevron. Bare disclosure glyph — no new i18n string this round; loom
    // owns whether a "details" label lands in the coordinated i18n pass.
    //
    // Terminal gates (Carlos's feedback): a lane can attach structured `commands`
    // ({cmd, explain}). When present they render inside the fold as individually
    // copyable rows with explainers — so the gate stays a note at rest and the
    // operations are tap-to-copy, not a wall to retype. Dark-safe: absent -> prose.
    const commands = item.commands ?? [];
    const hasCommands = commands.length > 0;
    const { headline, summary, body, hasMore } = summarize(item.q);
    // Expandable when there's body beyond the headline+summary, a context line, or
    // operational commands to reveal.
    const expandable = hasMore || hasCommands || !!item.ctx;
    const [detailsOpen, setDetailsOpen] = React.useState(false);

    // Per-command copy with quiet inline feedback (the copy glyph flips to a check
    // for a beat) — never a modal, per the Hearth's manners.
    const [copiedIdx, setCopiedIdx] = React.useState<number | null>(null);
    const copyCmd = React.useCallback(async (idx: number, cmd: string) => {
        try {
            await Clipboard.setStringAsync(cmd);
            setCopiedIdx(idx);
            setTimeout(() => setCopiedIdx((c) => (c === idx ? null : c)), 1500);
        } catch {
            // Clipboard can reject (web permissions) — stay quiet, the cmd is still visible.
        }
    }, []);

    const submit = (text: string) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        onAnswer(item.id, trimmed);
    };

    // Affirm carries the draft as a caveat when present ("Go ahead — <note>").
    const submitAffirm = () => submit(draft.trim() ? `${t('warden.affirm')} — ${draft.trim()}` : t('warden.affirm'));

    // Tap-a-choice: present only when a lane has structured its options. Absent ->
    // the universal affirm/decline + quick-reply pair. Never auto-selected.
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

            {/* At rest: a tight headline + one-line summary (scans in ~2s). Tap the text
                or the chevron to reveal the full accreted body + context + commands. */}
            <Pressable onPress={expandable ? () => setDetailsOpen((v) => !v) : undefined} disabled={!expandable}>
                {detailsOpen ? (
                    <Text style={styles.ask}>{body}</Text>
                ) : (
                    <>
                        <Text style={styles.headline} numberOfLines={2}>{headline}</Text>
                        {summary ? (
                            <Text style={styles.summary} numberOfLines={1}>{summary}</Text>
                        ) : null}
                    </>
                )}
            </Pressable>

            {detailsOpen && item.ctx ? (
                <Text style={styles.ctx}>{item.ctx}</Text>
            ) : null}

            {expandable ? (
                <Pressable onPress={() => setDetailsOpen((v) => !v)} hitSlop={8} style={styles.detailsToggle}>
                    <Text style={styles.detailsChevron}>{detailsOpen ? '▴' : '▾'}</Text>
                </Pressable>
            ) : null}

            {detailsOpen && hasCommands ? (
                <View style={styles.commandsBlock}>
                    {commands.map((c, idx) => (
                        <View key={idx} style={styles.cmdRow}>
                            <Pressable
                                onPress={() => copyCmd(idx, c.cmd)}
                                hitSlop={6}
                                style={styles.cmdLine}
                            >
                                <Text style={styles.cmdText} numberOfLines={3}>{c.cmd}</Text>
                                <Text style={styles.cmdCopyHint}>{copiedIdx === idx ? '✓' : '⧉'}</Text>
                            </Pressable>
                            {c.explain ? (
                                <Text style={styles.cmdExplain}>{c.explain}</Text>
                            ) : null}
                        </View>
                    ))}
                </View>
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
                        <Text style={styles.errorLine}>
                            {errored === 'auth' ? t('warden.sessionExpired') : t('warden.sendFailed')}
                        </Text>
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

// Group open asks by exact `ref`: 2+ sharing a ref cluster under one quiet label;
// everything else stands alone. We never hide a card and never guess similarity —
// only an identical ref groups (a fuzzy match would bury a lane's distinct framing).
type OpenGroup = { ref: string | null; items: WardenItem[] };

function groupByRef(open: WardenItem[]): OpenGroup[] {
    const counts = new Map<string, number>();
    for (const i of open) {
        if (i.ref) counts.set(i.ref, (counts.get(i.ref) ?? 0) + 1);
    }
    const groups: OpenGroup[] = [];
    const seen = new Set<string>();
    for (const i of open) {
        if (i.ref && (counts.get(i.ref) ?? 0) > 1) {
            if (seen.has(i.ref)) continue;
            seen.add(i.ref);
            groups.push({ ref: i.ref, items: open.filter((x) => x.ref === i.ref) });
        } else {
            groups.push({ ref: null, items: [i] });
        }
    }
    return groups;
}

export function WardenKnocks() {
    const { items, unreachable } = useWarden();
    // Optimistic answers (id -> text) shown immediately; reconciled by the next poll
    // once the server's write lands. Cleared if the POST fails (with a retry hint).
    const [overlay, setOverlay] = React.useState<Record<string, string>>({});
    // Error TYPE per card: 'auth' = stale token (re-auth, retrying is futile) vs 'send'
    // = transport failure (retry can help). Honest-actionable, not just honest.
    const [errors, setErrors] = React.useState<Record<string, 'auth' | 'send'>>({});
    // Answered history is collapsed by default — the active mantel stays clean.
    const [historyOpen, setHistoryOpen] = React.useState(false);

    const onAnswer = React.useCallback(async (id: string, text: string) => {
        setErrors((e) => { const n = { ...e }; delete n[id]; return n; });
        setOverlay((o) => ({ ...o, [id]: text }));   // optimistic settle
        const creds = await TokenStorage.getCredentials();
        const res = creds ? await answerWarden(creds, id, text) : { ok: false, authExpired: false };
        if (!res.ok) {
            // Revert the optimistic state; the draft is still in the card (we never
            // cleared it), so nothing is lost. Surface WHY: a dead token wants a re-auth
            // (retry won't help), a transport blip wants a retry.
            setOverlay((o) => {
                const next = { ...o };
                delete next[id];
                return next;
            });
            setErrors((e) => ({ ...e, [id]: res.authExpired ? 'auth' : 'send' }));
        }
    }, []);

    const isAnswered = (i: WardenItem) => !!i.a || !!overlay[i.id];
    const open = items.filter((i) => !isAnswered(i));
    const answered = items.filter(isAnswered);

    // The absence of a knock IS the all-clear — render nothing when there's no
    // history and nothing open. BUT only if the feed is actually reachable: a
    // persistently-dead feed with nothing to show reads LOUD (loom's three-state
    // discipline), never a silent "all clear" — this is an action surface, so a
    // broken feed Carlos can't see is the worst failure mode.
    if (open.length === 0 && answered.length === 0) {
        if (unreachable) {
            return (
                <View style={styles.wrapper}>
                    <View style={styles.container}>
                        <FeedUnreachable message={t('warden.feedUnreachable')} />
                    </View>
                </View>
            );
        }
        return null;
    }

    const card = (item: WardenItem) => (
        <KnockCard
            key={item.id}
            item={item}
            optimisticAnswer={overlay[item.id]}
            errored={errors[item.id]}
            onAnswer={onAnswer}
        />
    );

    const openGroups = groupByRef(open);

    return (
        <View style={styles.wrapper}>
            <View style={styles.container}>
                {open.length > 0 ? (
                    <>
                        <Text style={styles.sectionTitle}>{t('warden.sectionTitle')}</Text>
                        {openGroups.map((g, idx) =>
                            g.items.length > 1 ? (
                                <View key={g.ref ?? idx} style={styles.refCluster}>
                                    <Text style={styles.refClusterLabel} numberOfLines={1}>
                                        {t('warden.reference')}: {g.ref}
                                    </Text>
                                    {g.items.map(card)}
                                </View>
                            ) : (
                                card(g.items[0])
                            )
                        )}
                    </>
                ) : null}

                {answered.length > 0 ? (
                    <View style={styles.history}>
                        <Pressable
                            onPress={() => setHistoryOpen((v) => !v)}
                            hitSlop={8}
                            style={styles.historyHeader}
                        >
                            <Text style={styles.historyChevron}>{historyOpen ? '▾' : '▸'}</Text>
                            <Text style={styles.historyTitle}>
                                {t('warden.answered')} · {answered.length}
                            </Text>
                        </Pressable>
                        {historyOpen ? answered.map(card) : null}
                    </View>
                ) : null}
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
    // The at-rest headline — the tight scannable ask (the wall folds behind the chevron).
    headline: {
        fontSize: 15,
        color: theme.colors.text,
        lineHeight: 20,
        ...Typography.default('semiBold'),
    },
    summary: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        lineHeight: 18,
        marginTop: 2,
        ...Typography.default(),
    },
    ctx: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        lineHeight: 18,
        marginTop: 6,
        ...Typography.default(),
    },
    detailsToggle: {
        alignSelf: 'flex-start',
        marginTop: 4,
        paddingVertical: 2,
        paddingHorizontal: 6,
    },
    detailsChevron: {
        fontSize: 14,
        color: theme.colors.textSecondary,
        lineHeight: 16,
    },
    // Terminal-gate commands — each a tap-to-copy row with its explainer. Reads as
    // a quiet checklist, not a console block.
    commandsBlock: {
        marginTop: 8,
        gap: 8,
    },
    cmdRow: {
        gap: 2,
    },
    cmdLine: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.divider,
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 6,
        backgroundColor: theme.colors.groupped.background,
    },
    cmdText: {
        flex: 1,
        fontSize: 12,
        color: theme.colors.text,
        ...Typography.mono(),
    },
    cmdCopyHint: {
        fontSize: 13,
        color: theme.colors.textSecondary,
    },
    cmdExplain: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        lineHeight: 16,
        marginLeft: 2,
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
    // [3] ref cluster — a quiet bracket around asks that share a ref. The shared
    // ref shows once as the cluster label; the per-card reference line drops out
    // visually by virtue of being the same string (kept on the card for clarity).
    refCluster: {
        borderLeftWidth: StyleSheet.hairlineWidth,
        borderLeftColor: theme.colors.divider,
        paddingLeft: 8,
        marginBottom: 8,
    },
    refClusterLabel: {
        fontSize: 11,
        color: theme.colors.textSecondary,
        marginBottom: 6,
        marginLeft: 2,
        ...Typography.default('semiBold'),
    },
    // [1] answered history — collapsed by default; the conversation record kept
    // out of the active surface's way.
    history: {
        marginTop: 4,
    },
    historyHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 6,
        marginLeft: 4,
    },
    historyChevron: {
        fontSize: 12,
        color: theme.colors.groupped.sectionTitle,
        lineHeight: 14,
    },
    historyTitle: {
        fontSize: 13,
        color: theme.colors.groupped.sectionTitle,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        ...Typography.default('semiBold'),
    },
}));
