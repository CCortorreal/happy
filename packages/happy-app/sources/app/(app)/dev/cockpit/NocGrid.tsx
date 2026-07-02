import * as React from 'react';
import { View, ScrollView } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { CockpitSelectionContext } from './selection';
import { CockpitHeader } from './components/header';
import { SessionsLink } from './components/SessionsLink';
import { NeedsYouPlane } from './planes/NeedsYouPlane';
import { TheWorkPlane } from './planes/TheWorkPlane';
import { VitalsStrip } from './planes/VitalsStrip';
import { FloorsPlane } from './planes/FloorsPlane';
import { RelayPlane } from './planes/RelayPlane';
import { OperatorPane } from './components/OperatorPane';
import { RosterLedger } from './components/RosterLedger';
import { PaComposer } from './components/PaComposer';

// ============================================================================
// NOC GRID (CKP-09/16/14) — the DESKTOP posture. This is not a re-densified
// version of the phone column; it is a structurally different surface. The
// page body never scrolls — a full-width header bar sits above three columns
// that each own their own vertical scroll:
//
//   A. BOARD (380 / min 340) — the interrupts + the collapsed lane board.
//      NeedsYouPlane pinned first, then TheWorkPlane in boardMode (collapsed
//      tiles, press = select into the operator pane via the selection context).
//   B. OPERATOR PANE (flex, min 520) — the lit workbench. Shows the selected
//      lane's OperatorPane, or the RosterLedger when nothing is selected
//      (terminal-visible-by-default: the shell auto-selects the top lane on
//      first paint, so B is rarely empty — but an explicit clear drops here).
//   C. RIGHT RAIL (320) — vitals gauges → floors ladder → PA composer → the
//      relay feed (flex-fills the remainder, its own nested scroll).
//
// Deck/phone never render this — they keep today's single vertical column
// (see the shell). CKP-16: capability is posture-invariant, layout is not.
// ============================================================================

export const NocGrid = React.memo(function NocGrid() {
    const selection = React.useContext(CockpitSelectionContext);
    const { selectedSessionId, selectedSeatId } = selection;

    return (
        <View style={styles.root}>
            <View style={styles.headerBar}>
                <CockpitHeader />
                <SessionsLink />
            </View>
            <View style={styles.columns}>
                {/* A. BOARD */}
                <ScrollView
                    style={styles.columnA}
                    contentContainerStyle={styles.columnAContent}
                >
                    <NeedsYouPlane />
                    <TheWorkPlane boardMode />
                </ScrollView>

                {/* B. OPERATOR PANE (or RosterLedger when nothing selected) */}
                <ScrollView
                    style={styles.columnB}
                    contentContainerStyle={styles.columnScrollContent}
                >
                    {selectedSessionId ? (
                        <OperatorPane sessionId={selectedSessionId} seatId={selectedSeatId} />
                    ) : (
                        <RosterLedger />
                    )}
                </ScrollView>

                {/* C. RIGHT RAIL */}
                <ScrollView
                    style={styles.columnC}
                    contentContainerStyle={styles.columnScrollContent}
                >
                    <VitalsStrip variant="gauges" />
                    <FloorsPlane />
                    <PaComposer />
                    <RelayPlane variant="rail" />
                </ScrollView>
            </View>
        </View>
    );
});

const styles = StyleSheet.create((theme) => ({
    // The desktop root fills its parent and never scrolls itself — each column
    // is its own ScrollView. minHeight:0 is load-bearing on web so the flex
    // children can actually shrink and scroll instead of pushing the body.
    root: {
        flex: 1,
        minHeight: 0,
        width: '100%',
        paddingHorizontal: 20,
    },
    headerBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: 56,
        gap: 12,
    },
    columns: {
        flex: 1,
        flexDirection: 'row',
        minHeight: 0,
    },
    columnA: {
        flexGrow: 0,
        flexShrink: 1,
        width: 380,
        minWidth: 340,
        minHeight: 0,
        backgroundColor: theme.colors.groupped.background,
        borderRightWidth: 1,
        borderColor: theme.colors.divider,
    },
    columnAContent: {
        flexGrow: 1,
        paddingBottom: 32,
    },
    columnB: {
        flexGrow: 1,
        flexShrink: 1,
        flexBasis: 0,
        minWidth: 520,
        minHeight: 0,
        backgroundColor: theme.colors.surface,
        borderRightWidth: 1,
        borderColor: theme.colors.divider,
    },
    columnC: {
        flexGrow: 0,
        flexShrink: 0,
        width: 320,
        minHeight: 0,
        backgroundColor: theme.colors.groupped.background,
    },
    columnScrollContent: {
        flexGrow: 1,
        paddingBottom: 32,
    },
}));
