import * as React from 'react';
import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useDensity } from '../density';

// ============================================================================
// CKP-11 TREE RAILS — hand-rolled connector rails replacing the old flat
// `depth * 28px` margin indent. A nested tile row is [ TreeGutter, tile ]; the
// gutter draws the vertical ancestor rails + the elbow that joins THIS tile to
// its parent.
//
// HONEST HIERARCHY: rails are drawn ONLY for PROVEN parent_seat_id edges. An
// inferred host+pedal fan-out never earns a rail — it keeps the WorkerFanout
// avatar-strip + `inferred` caption. A rail is a claim of proven lineage; we
// never draw one we can't back.
//
// railStep (density token, spec C2): 20 / 20 / 16 (desktop/deck/phone). Owned
// and landed in density.ts by lane-noc; consumed directly off `d.railStep` so a
// retune of the token propagates here automatically (a local copy would silently
// diverge). Values: 20 / 20 / 16.
// ============================================================================

export function TreeGutter({ depth, ancestorsContinue, isLast }: {
    // This tile's depth INSIDE its frame/forest (restarts at 0 inside a cage so
    // rails never cross the teal border). depth 0 renders nothing (root row).
    depth: number;
    // For each ancestor level i (0..depth-1): does that ancestor have a later
    // sibling below this subtree? If so, its vertical rail continues past this
    // row; if not, it stopped above and we draw nothing at that column.
    ancestorsContinue: boolean[];
    // Is THIS tile the last child of its parent? A last child's elbow is a short
    // top segment (the rail terminates at the elbow); a non-last child's elbow
    // runs full-height so the rail continues down to the next sibling.
    isLast: boolean;
}) {
    const { theme } = useUnistyles();
    const d = useDensity();
    const railStep = d.railStep;

    if (depth <= 0) return null;

    const railColor = theme.colors.divider;
    const width = depth * railStep;

    // Ancestor pass-through rails: one vertical line per ancestor level whose
    // rail continues past this row (i < depth - 1). The immediate-parent column
    // (i === depth - 1) is drawn by the elbow, not here.
    const ancestorRails: React.ReactElement[] = [];
    for (let i = 0; i < depth - 1; i++) {
        if (ancestorsContinue[i]) {
            ancestorRails.push(
                <View
                    key={`rail-${i}`}
                    style={{
                        position: 'absolute',
                        left: i * railStep + 9,
                        width: 2,
                        top: 0,
                        bottom: 0,
                        backgroundColor: railColor,
                    }}
                />,
            );
        }
    }

    // Elbow at the immediate-parent column (depth - 1): a vertical segment + a
    // horizontal stub that reaches toward the tile. Last child -> the vertical
    // terminates at the elbow (height 22); non-last -> it runs full-height so
    // the rail flows on to the next sibling.
    const elbowLeft = (depth - 1) * railStep + 9;
    const vertical = isLast
        ? { position: 'absolute' as const, left: elbowLeft, width: 2, top: 0, height: 22, backgroundColor: railColor }
        : { position: 'absolute' as const, left: elbowLeft, width: 2, top: 0, bottom: 0, backgroundColor: railColor };
    const horizontal = {
        position: 'absolute' as const,
        left: elbowLeft,
        top: 20,
        width: railStep - 10,
        height: 2,
        backgroundColor: railColor,
    };

    return (
        <View style={[styles.gutter, { width }]}>
            {ancestorRails}
            <View style={vertical} />
            <View style={horizontal} />
        </View>
    );
}

const styles = StyleSheet.create(() => ({
    gutter: {
        alignSelf: 'stretch',
        position: 'relative',
    },
}));
