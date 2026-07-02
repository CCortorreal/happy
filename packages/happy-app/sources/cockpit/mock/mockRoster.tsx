import * as React from 'react';
import { View, Pressable } from 'react-native';
import { Text } from '@/components/StyledText';
import { StyleSheet } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { type Density } from '../density';

// NOTE: the MOCK_RECURSIVE_ROSTER fixture itself lives in @/hooks/useCongressTree.ts
// (it does not move) — this file houses the two dev-only chrome controls that share
// the densityChip* styles.

// Dev-only density OVERRIDE picker (CKP-14). Posture is auto-detected off window
// width (usePosture: >=1180 desktop, else phone — deck is NEVER auto-detected, a
// couch is not a width). This control lets the desk PIN a posture for dogfooding
// all three in one browser tab without resizing the window:
//   - `auto`  (default, override === null) → follow the detected posture; the
//     chip shows the live detected value, e.g. `auto (desktop)`, so it's never a
//     silent lie about which layout is actually rendering.
//   - desktop / deck / phone → force that posture until switched back to auto.
// Not shipped to the live surface (dev-gated in the shell).
export function DensityPicker({ override, detected, onChange }: {
    override: Density | null;
    detected: Density;
    onChange: (next: Density | null) => void;
}) {
    const options: (Density | null)[] = [null, 'desktop', 'deck', 'phone'];
    return (
        <View style={styles.densityPicker}>
            {options.map((opt) => {
                const active = opt === override;
                const label = opt === null ? `auto (${detected})` : opt;
                return (
                    <Pressable
                        key={opt ?? 'auto'}
                        onPress={() => onChange(opt)}
                        style={[styles.densityChip, active && styles.densityChipActive]}
                    >
                        <Text style={[styles.densityChipText, active && styles.densityChipTextActive]}>
                            {label}
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
