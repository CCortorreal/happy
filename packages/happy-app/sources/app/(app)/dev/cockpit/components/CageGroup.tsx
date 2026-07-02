import * as React from 'react';
import { View } from 'react-native';
import { Text } from '@/components/StyledText';
import { StyleSheet } from 'react-native-unistyles';
import { Ionicons } from '@expo/vector-icons';
import { Typography } from '@/constants/Typography';
import { ACCENT_CAGE, ACCENT_CAGE_TINT, AMBER } from '../colors';
import { useDensity, scaled } from '../density';

// ============================================================================
// CKP-10 SOVEREIGNTY — the cage frame. A sealed enclosure reads as SHAPE +
// ENCLOSURE, never a label the human must parse at 2am. Three redundant
// channels carry sovereignty (frame / square avatars / lock badge); this is
// channel 1: a 1.5px teal frame with a tinted fill, a lock glyph, the mono
// cage id, and a `SEALED · N seats` chip.
//
// HONEST-STATE DISCIPLINE: the frame NEVER recolors the honest state of the
// seats inside it — a dead sealed seat is a RED dot inside a teal frame. Teal
// is enclosure, not health. Sealed never renders naked (a sealed seat whose
// cage_id resolves to no on-screen root still gets its own single-seat frame).
//
// GRAFT 8 — writer-invariant violation: a seat with cage_status==='sealed' but
// cage_id == null is a broken write (sealed seats must resolve a concrete
// cage). We render it LOUD: an AMBER sub-line `sealed — cage unknown`, never a
// silent teal frame pretending the enclosure is known.
// ============================================================================

export function CageGroup({ cageId, seatCount, wardenDead, children }: {
    // The resolved cage id, or null when the writer left it unset (graft 8).
    cageId: string | null;
    // Number of sealed seats enclosed — drives the `SEALED · N seats` chip.
    seatCount: number;
    // True when this cage's root (warden) seat is dead per deriveLiveness. The
    // frame itself never recolors, but the header id reads in RED so a dead
    // warden is loud even at a glance (mirrors the header's `cage: down`).
    wardenDead?: boolean;
    children: React.ReactNode;
}) {
    const d = useDensity();
    const cageUnknown = cageId == null;
    return (
        <View style={[styles.frame, { borderRadius: d.cardRadius + 2 }]}>
            <View style={styles.headerRow}>
                <Ionicons name="lock-closed" size={12} color={ACCENT_CAGE} />
                <Text
                    style={[
                        styles.cageId,
                        { fontSize: scaled(11, d.typeScale) },
                        wardenDead && styles.cageIdDead,
                    ]}
                    numberOfLines={1}
                >
                    {cageUnknown ? 'cage unknown' : cageId}
                </Text>
                <View style={styles.spacer} />
                <Text style={[styles.sealedChip, { fontSize: scaled(10.5, d.typeScale) }]}>
                    SEALED · {seatCount} seat{seatCount === 1 ? '' : 's'}
                </Text>
            </View>
            {cageUnknown ? (
                <Text style={[styles.cageUnknownLine, { fontSize: scaled(11, d.typeScale) }]}>
                    sealed — cage unknown
                </Text>
            ) : null}
            {children}
        </View>
    );
}

const styles = StyleSheet.create((theme) => ({
    frame: {
        borderWidth: 1.5,
        borderColor: ACCENT_CAGE,
        backgroundColor: ACCENT_CAGE_TINT,
        padding: 8,
        marginBottom: 8,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 6,
    },
    cageId: {
        color: ACCENT_CAGE,
        ...Typography.mono(),
    },
    // A dead warden is loud even here — the enclosure stays teal (it's still a
    // cage) but the id reads destructive so the human's eye lands on it.
    cageIdDead: {
        color: theme.colors.textDestructive,
    },
    spacer: {
        flex: 1,
    },
    sealedChip: {
        color: ACCENT_CAGE,
        ...Typography.default('semiBold'),
    },
    // GRAFT 8 — the writer-invariant violation line. AMBER, loud, never teal-calm.
    cageUnknownLine: {
        color: AMBER,
        marginBottom: 6,
        fontStyle: 'italic',
        ...Typography.default('semiBold'),
    },
}));
