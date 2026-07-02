import * as React from 'react';
import { View } from 'react-native';
import { Text } from '@/components/StyledText';
import { StyleSheet } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { CongressKanbanCounts } from '@/sync/congressKanbanTypes';
import { GREEN, AMBER, GREY } from '../colors';
import { scaled } from '../density';

// KANBAN CHIPS (mission A3, work-state grid). Building-style compact counts:
// blocked reads amber (the one state that needs attention), done reads muted
// (past-tense, not a call to action), todo/doing read neutral text. Density-
// aware sizing via the caller's scaled() calls. Absent data (undefined, or
// every count null) renders NOTHING — honest omission per the mission spec,
// never zeros-as-real (a lane with a real 0 todo would need the oracle to
// have actually said so, which cardCounts' honest-null discipline already
// guards upstream in congressKanbanTypes.ts/apiCongressKanban.ts).
export function KanbanChips({ counts, typeScale }: { counts: CongressKanbanCounts | undefined; typeScale: number }) {
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

const styles = StyleSheet.create((theme) => ({
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
}));
