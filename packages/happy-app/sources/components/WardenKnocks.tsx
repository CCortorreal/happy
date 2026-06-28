import * as React from 'react';
import { View } from 'react-native';
import { Text } from '@/components/StyledText';
import { StyleSheet } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { layout } from './layout';
import { useWarden } from '@/hooks/useWarden';
import { WardenItem } from '@/sync/wardenTypes';
import { t } from '@/text';

// WardenKnocks — Hearth P1 RELATE layer (the knock-cards).
//
// Renders the Warden's for-carlos asks as cards that read like a note a person
// left, never an alert. Manners (load-bearing, from the warden-watchdog-ui spec):
//   - render NOTHING when the queue is empty (the absence of a knock IS the
//     all-clear — never a wall of "you're all caught up");
//   - never modal, never steal focus — this is inline content at the top of the
//     Hearth, not a popup;
//   - a 'gate' ask blocks (red left-edge); a 'routine' ask is optional (lilac);
//   - an answered ask stays visible with its note but never re-gates attention.
//
// Read-only: answering (write-back) is the next slice. The Warden owns the file.

// Named accents, restraint — red = a gate that blocks, lilac = needs-your-call.
const ACCENT_GATE = '#E5484D';
const ACCENT_ROUTINE = '#9B7EDE';

function KnockCard({ item }: { item: WardenItem }) {
    const answered = !!item.a;
    const isGate = (item.kind ?? '').toLowerCase() === 'gate';
    const accent = isGate ? ACCENT_GATE : ACCENT_ROUTINE;

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

            {item.a ? (
                <Text style={styles.answer} numberOfLines={3}>{item.a}</Text>
            ) : null}

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
    if (items.length === 0) {
        return null;
    }

    // Open asks lead; answered (closed) asks trail but stay visible.
    const open = items.filter((i) => !i.a);
    const answered = items.filter((i) => !!i.a);
    const ordered = [...open, ...answered];

    return (
        <View style={styles.wrapper}>
            <View style={styles.container}>
                <Text style={styles.sectionTitle}>{t('warden.sectionTitle')}</Text>
                {ordered.map((item) => (
                    <KnockCard key={item.id} item={item} />
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
    reference: {
        fontSize: 11,
        color: theme.colors.textSecondary,
        marginTop: 6,
        ...Typography.default(),
    },
}));
