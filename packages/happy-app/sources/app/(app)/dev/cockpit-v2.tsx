import * as React from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { layout } from '@/components/layout';
import { useLocalSetting } from '@/sync/storage';
import { MOCK_RECURSIVE_ROSTER } from '@/hooks/useCongressTree';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { type Density, DensityContext } from './cockpit/density';
import { NeedsYouPlane } from './cockpit/planes/NeedsYouPlane';
import { TheWorkPlane } from './cockpit/planes/TheWorkPlane';
import { VitalsStrip } from './cockpit/planes/VitalsStrip';
import { FloorsPlane } from './cockpit/planes/FloorsPlane';
import { RelayPlane } from './cockpit/planes/RelayPlane';
import { CockpitHeader } from './cockpit/components/header';
import { DensityPicker, MockRosterToggle } from './cockpit/mock/mockRoster';

// Cockpit v2 — the WORK-FIRST reframe (July-7 spec, §6.1 Slice 1). DEV ROUTE, not
// wired into Carlos's live surface (SessionsList.tsx stays untouched). Same for-carlos
// / roster / gauge feeds, but the SPINE inverts: three planes, top to bottom —
//   1. NEEDS-YOU  — the interrupt (warden knock-cards). Boring-when-healthy: a thin
//      quiet line, never an empty labeled box.
//   2. THE WORK   — the living center + DEFAULT focus. Per-lane tile: work-object
//      thought-line (never a bare gerund), honest state (fail-honest, derived from a
//      fresh probe — never a hard green), room for a live tail on expand.
//   3. VITALS     — Vram/Disk/Context/Heartbeat/Backlog collapsed into ONE compact
//      dot-row, boring-when-healthy, tap-to-expand to the full gauge. A dead feed
//      reads LOUD (red dot) — never a calm lie.
//
// §0 honesty-spine everywhere: three-state RENDER/QUIET/LOUD, honest-null, no
// hard-coded green. Reuses the SAME derivation SessionsList.tsx uses (congressHealthStatus/
// voiceThought/contextPressure are now exported from there for exactly this reuse — no
// forked copy of the honest-state logic). Dev page → i18n-exempt.
//
// Slice 2 (the trust-debt floor, spec §5) closed IN THIS FILE:
//   - G10/G14: laneHonestState's plain-session fallback painted an idle-but-connected
//     ('waiting') lane the SAME green as an actively-working one — fixed to GREY, same
//     as every other idle read (deriveLiveness's 'idle' verdict, disconnected, etc.).
//   - G11: the identity sub-line silently fell back to a raw cwd-path fragment when a
//     session had no congress seat to reconcile a role against. Now says so honestly
//     ("no seat role — not a congress lane") instead of quietly presenting a path
//     fragment as if it were an identity — the exact confusion that cost a live-overseer
//     archive. (The primary title row, session.name, was already role/summary-derived,
//     never cwd — verified via getSessionName in sessionUtils.ts.)
//   - G13: verified, not re-fixed here — useHonestFeed.ts (shared, already reused by
//     every feed this file polls) already races each poll against a 4s timeout
//     (POLL_TIMEOUT_MS) with unreachableAfter=3, so a HUNG backend surfaces LOUD within
//     ~12s. True per-poll AbortController cancellation of the underlying fetch (vs. just
//     racing/ignoring it) would require threading a signal through every apiXxx.ts
//     fetcher + the shared `backoff()` retry wrapper in utils/time.ts — out of this
//     dev-route lane's scope since those are shared by the live surface too; flagged,
//     not silently skipped.
//   - G17/G18: VitalsStrip's dot collapsed "no successful read yet" (first paint / a
//     boot still binding) and "confirmed dead after a good read" into the same alarm
//     red. Split into BINDING (grey, "reading…") vs DEAD (red) vs DEGRADED (amber) vs
//     healthy (green) — never a calm green over an unknown, never the same red for
//     "still starting up" as for "confirmed gone."
//   - G20: gauge/vitals reserved heights were already in place (VramGauge/DiskGauge/
//     ContextGauge/BacklogGauge minHeight + FeedUnreachable's minHeight prop, laneTile's
//     minHeight: 64) from the shared-hook work that predates this dev route; verified
//     still wired correctly, not re-done.
//
// PURE-MOVE SPLIT (2026-07-02): the planes/components/density system now live under
// ./cockpit/ — this file stays at this path as the thin composition shell (the
// external machine check greps `export function CockpitV2Screen` + the default
// export here, and (app)/index.tsx imports the default from this path).

// Preserve this file's public type surface — `Density` was exported from here
// before the split (nothing imports it today, kept for parity).
export type { Density } from './cockpit/density';

// ============================================================================
// ROOT — three planes, top to bottom. THE WORK is the default view (no black
// void, no hand-pick-a-session-first gate).
// ============================================================================

// Named export of the main screen component — imported directly by the
// landing route (sources/app/(app)/index.tsx), which is now the default
// export there instead of this dev route. This file stays AT THIS PATH
// (external machine check greps it) and keeps working standalone as
// dev/cockpit-v2 too (below), just rendering the same component.
export function CockpitV2Screen() {
    const [density, setDensity] = React.useState<Density>('desktop');
    const [mockOn, setMockOn] = React.useState(false);
    const router = useRouter();
    const { theme } = useUnistyles();
    // Dev-only affordances (density picker, mock-roster toggle) stay reachable
    // for dogfooding but never show on the production landing surface by
    // default — gated behind the same __DEV__ || devModeEnabled pattern used
    // across the app (see SettingsView.tsx, voice.tsx, ToolFullView.tsx).
    const devModeEnabled = __DEV__ || useLocalSetting('devModeEnabled');
    return (
        <DensityContext.Provider value={density}>
            <ScrollView contentContainerStyle={styles.scroll}>
                <View style={styles.container}>
                    <View style={styles.topBarRow}>
                        <CockpitHeader />
                        <Pressable
                            hitSlop={8}
                            onPress={() => router.push('/sessions/index')}
                            style={styles.sessionsLinkButton}
                            accessibilityLabel="Classic session list"
                        >
                            <Ionicons name="list" size={18} color={theme.colors.textSecondary} />
                        </Pressable>
                    </View>
                    {devModeEnabled ? (
                        <View style={styles.devToolsRow}>
                            <DensityPicker density={density} onChange={setDensity} />
                            <MockRosterToggle on={mockOn} onChange={setMockOn} />
                        </View>
                    ) : null}
                    <NeedsYouPlane />
                    <TheWorkPlane mockRoster={mockOn ? MOCK_RECURSIVE_ROSTER : null} />
                    <VitalsStrip />
                    <FloorsPlane />
                    <RelayPlane />
                </View>
            </ScrollView>
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
    sessionsLinkButton: {
        padding: 8,
        marginLeft: 8,
    },
}));
