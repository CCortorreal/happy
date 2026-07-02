import * as React from 'react';
import { View, Pressable } from 'react-native';
import { Text } from '@/components/StyledText';
import { StyleSheet } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { type Density } from '../density';

// NOTE: the MOCK_RECURSIVE_ROSTER fixture itself lives in @/hooks/useCongressTree.ts
// (it does not move) — this file houses the two dev-only chrome controls that share
// the densityChip* styles.

// Dev-only density picker. The cockpit's three postures (desktop / phone / deck)
// all read the SAME component tree — this segmented control switches the
// DensityContext value so the desk can dogfood all three in one browser tab
// without simulating device widths. Not shipped to the live surface.
export function DensityPicker({ density, onChange }: { density: Density; onChange: (d: Density) => void }) {
    const options: Density[] = ['desktop', 'deck', 'phone'];
    return (
        <View style={styles.densityPicker}>
            {options.map((opt) => {
                const active = opt === density;
                return (
                    <Pressable
                        key={opt}
                        onPress={() => onChange(opt)}
                        style={[styles.densityChip, active && styles.densityChipActive]}
                    >
                        <Text style={[styles.densityChipText, active && styles.densityChipTextActive]}>
                            {opt}
                        </Text>
                    </Pressable>
                );
            })}
        </View>
    );
}

// Dev-only mock-roster toggle. When ON, TheWorkPlane consumes the hardcoded
// MOCK_RECURSIVE_ROSTER fixture (penthouse-god -> 2 floor-gods -> 1-2 workers
// each) so the recursive-tier render code path can be exercised even while
// the live seats-oracle roster is still a flat forest (no real seat has
// parent_seat_id set yet). NOT shipped to the live surface — cockpit-v2 is a
// dev route only, and this toggle is scoped to it.
export function MockRosterToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
    return (
        <Pressable
            onPress={() => onChange(!on)}
            style={[styles.densityChip, on && styles.densityChipActive]}
        >
            <Text style={[styles.densityChipText, on && styles.densityChipTextActive]}>
                {on ? 'Mock roster: ON' : 'Mock recursive roster'}
            </Text>
        </Pressable>
    );
}

const styles = StyleSheet.create((theme) => ({
    densityPicker: {
        flexDirection: 'row',
        gap: 6,
        marginBottom: 12,
        alignSelf: 'flex-start',
    },
    densityChip: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 6,
        backgroundColor: theme.colors.groupped.background,
    },
    densityChipActive: {
        backgroundColor: theme.colors.textLink,
    },
    densityChipText: {
        fontSize: 11,
        color: theme.colors.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        ...Typography.default('semiBold'),
    },
    densityChipTextActive: {
        color: '#FFFFFF',
    },
}));
