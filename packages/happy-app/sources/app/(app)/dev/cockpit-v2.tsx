import * as React from 'react';
import { View, ScrollView } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { layout } from '@/components/layout';
import { useLocalSetting } from '@/sync/storage';
import { MOCK_RECURSIVE_ROSTER } from '@/hooks/useCongressTree';
import { usePosture } from '@/hooks/usePosture';
import { type Density, DensityContext } from './cockpit/density';
import { CockpitSelectionContext, type CockpitSelection } from './cockpit/selection';
import { NeedsYouPlane } from './cockpit/planes/NeedsYouPlane';
import { TheWorkPlane } from './cockpit/planes/TheWorkPlane';
import { VitalsStrip } from './cockpit/planes/VitalsStrip';
import { FloorsPlane } from './cockpit/planes/FloorsPlane';
import { RelayPlane } from './cockpit/planes/RelayPlane';
import { CockpitHeader } from './cockpit/components/header';
import { SessionsLink } from './cockpit/components/SessionsLink';
import { NocGrid } from './cockpit/NocGrid';
import { DensityPicker, MockRosterToggle } from './cockpit/mock/mockRoster';

// Cockpit v2 — the WORK-FIRST reframe (July-7 spec, §6.1 Slice 1). DEV ROUTE, not
// wired into Carlos's live surface (SessionsList.tsx stays untouched). Same for-carlos
// / roster / gauge feeds, but the SPINE inverts.
//
// NOC transformation (CKP-09/16/14): posture is now genuinely two-shaped, not one
// re-densified column. usePosture() auto-resolves ONLY desktop (>=1180) vs phone
// (<1180) off the live window width — 'deck' is never auto-detected (a couch is not
// a width; judge graft 7), it exists only via the dev override picker.
//   - desktop → <NocGrid/>: a three-region command surface (BOARD · OPERATOR · RAIL),
//     each column its own scroll, the body itself never scrolls. Structurally
//     different from phone, not a denser column (CKP-16).
//   - deck/phone → today's single ScrollView, plane order EXACTLY unchanged
//     (NEEDS-YOU → THE WORK → VITALS → FLOORS → RELAY). Phone keeps the dots
//     vitals variant; deck gets gauges. Capability is posture-invariant.
//
// §0 honesty-spine everywhere: three-state RENDER/QUIET/LOUD, honest-null, no
// hard-coded green. Dev page → i18n-exempt.
//
// PURE-MOVE SPLIT (2026-07-02): the planes/components/density system now live under
// ./cockpit/ — this file stays at this path as the thin composition shell (the
// external machine check greps `export function CockpitV2Screen` + the default
// export here, and (app)/index.tsx imports the default from this path).

// Preserve this file's public type surface — `Density` was exported from here
// before the split (kept for parity; also re-exported for the split guard).
export type { Density } from './cockpit/density';

// ============================================================================
// SHELL — resolves posture, owns the selection + density providers, and picks
// the layout: NocGrid at desktop, today's single column at deck/phone.
// ============================================================================

export function CockpitV2Screen() {
    // Dev-only override: null means "follow the auto-detected posture." The
    // picker can pin desktop/deck/phone for dogfooding all three in one tab.
    const [devOverride, setDevOverride] = React.useState<Density | null>(null);
    const [mockOn, setMockOn] = React.useState(false);
    const auto = usePosture();
    const density = devOverride ?? auto;

    // HOOK-ORDER FIX: the old `__DEV__ || useLocalSetting(...)` short-circuited
    // the hook whenever __DEV__ was true — a conditional hook call, unstable
    // across a __DEV__ flip and a React rules-of-hooks violation. Call the hook
    // unconditionally, then OR the flag.
    const devSetting = useLocalSetting('devModeEnabled');
    const devModeEnabled = __DEV__ || devSetting;

    // Selection state lives HERE (contract C1) so both the board (Column A) and
    // the operator pane (Column B) read one source of truth. autoSelect only
    // fires the first-paint convenience pick if the user hasn't acted yet.
    const [selectedSessionId, setSelectedSessionId] = React.useState<string | null>(null);
    const [selectedSeatId, setSelectedSeatId] = React.useState<string | null>(null);
    const userActed = React.useRef(false);

    const selection = React.useMemo<CockpitSelection>(() => ({
        selectedSessionId,
        selectedSeatId,
        select(sessionId, seatId) {
            userActed.current = true;
            setSelectedSessionId(sessionId);
            setSelectedSeatId(seatId ?? null);
        },
        autoSelect(sessionId, seatId) {
            if (userActed.current) return;
            setSelectedSessionId(sessionId);
            setSelectedSeatId(seatId ?? null);
        },
        clear() {
            userActed.current = true;
            setSelectedSessionId(null);
            setSelectedSeatId(null);
        },
    }), [selectedSessionId, selectedSeatId]);

    return (
        <DensityContext.Provider value={density}>
            <CockpitSelectionContext.Provider value={selection}>
                {density === 'desktop' ? (
                    <NocGrid />
                ) : (
                    <ScrollView contentContainerStyle={styles.scroll}>
                        <View style={styles.container}>
                            <View style={styles.topBarRow}>
                                <CockpitHeader />
                                <SessionsLink />
                            </View>
                            {devModeEnabled ? (
                                <View style={styles.devToolsRow}>
                                    <DensityPicker
                                        override={devOverride}
                                        detected={auto}
                                        onChange={setDevOverride}
                                    />
                                    <MockRosterToggle on={mockOn} onChange={setMockOn} />
                                </View>
                            ) : null}
                            <NeedsYouPlane />
                            <TheWorkPlane mockRoster={mockOn ? MOCK_RECURSIVE_ROSTER : null} />
                            <VitalsStrip variant={density === 'phone' ? 'dots' : 'gauges'} />
                            <FloorsPlane />
                            <RelayPlane />
                        </View>
                    </ScrollView>
                )}
            </CockpitSelectionContext.Provider>
        </DensityContext.Provider>
    );
}

// dev/cockpit-v2 route itself keeps working — renders the same component.
export default function CockpitV2() {
    return <CockpitV2Screen />;
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
    topBarRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    devToolsRow: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 14,
        marginBottom: 4,
        alignItems: 'center',
        flexWrap: 'wrap',
    },
}));
