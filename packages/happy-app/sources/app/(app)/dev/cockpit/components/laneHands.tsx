import * as React from 'react';
import { View, TextInput, Pressable } from 'react-native';
import { Text } from '@/components/StyledText';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { sync } from '@/sync/sync';
import { storage } from '@/sync/storage';
import { sessionAbort } from '@/sync/ops';
import { RED } from '../colors';
import { useDensity, scaled } from '../density';

// ----------------------------------------------------------------------------
// LANE HANDS (Mission A1) — steer + gated halt on the expanded tile. The
// cockpit gets hands, mirroring the building's control register:
//   STEER — injects context into the lane's underlying session via the EXACT
//     send path the session chat screen uses (sync.sendMessage source:'chat',
//     see SessionView.tsx handleSend) — no new transport, no keystroke
//     simulation. The ack is honest: an optimistic "steered ·" chip (we sent
//     it, nothing more claimed) and then the live tail itself shows the
//     effect. A send that throws reads LOUD ("steer failed"), never quiet.
//   HALT — wired to Happy's existing abort primitive (sessionAbort in
//     sync/ops.ts — the same sessionRPC 'abort' the chat screen's stop button
//     fires, including the resetSessionAgentOverrides it does first). Two-
//     step: tap arms (destructive-red "confirm halt"), second tap within 5s
//     executes, else disarms. "halt sent" is the strongest claim made — the
//     lane's own honest state shows whether it actually stopped.
// Density-aware via the same tokens every atom here reads (minTouchSize /
// typeScale): desktop inline, phone compact-but-present, deck big targets.
// Renders ONLY behind the renderSafe gate (a privacy-gated seat is not
// steerable from this surface) and only for a REAL session row — a SYNTH:
// seat-only row has no conversable session, which LaneTile says honestly
// instead of painting a dead input.
export function LaneHands({ sessionId }: { sessionId: string }) {
    const { theme } = useUnistyles();
    const d = useDensity();
    const [draft, setDraft] = React.useState('');
    const [steerState, setSteerState] = React.useState<'idle' | 'steered' | 'failed'>('idle');
    const [haltArmed, setHaltArmed] = React.useState(false);
    const [haltState, setHaltState] = React.useState<'idle' | 'sent' | 'failed'>('idle');
    const steerChipTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const disarmTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    React.useEffect(() => () => {
        if (steerChipTimer.current) clearTimeout(steerChipTimer.current);
        if (disarmTimer.current) clearTimeout(disarmTimer.current);
    }, []);

    const submitSteer = React.useCallback(async () => {
        const text = draft.trim();
        if (!text) return;
        setDraft('');
        // Optimistic chip — "steered ·" claims only that the send was fired;
        // the live tail above is the real evidence of effect (no fake ack).
        setSteerState('steered');
        if (steerChipTimer.current) clearTimeout(steerChipTimer.current);
        steerChipTimer.current = setTimeout(() => setSteerState('idle'), 8000);
        try {
            await sync.sendMessage(sessionId, text, { source: 'chat' });
        } catch {
            if (steerChipTimer.current) clearTimeout(steerChipTimer.current);
            setSteerState('failed');
        }
    }, [draft, sessionId]);

    const onHaltPress = React.useCallback(() => {
        if (!haltArmed) {
            // Step 1: ARM. Disarms itself after 5s if not confirmed.
            setHaltArmed(true);
            if (disarmTimer.current) clearTimeout(disarmTimer.current);
            disarmTimer.current = setTimeout(() => setHaltArmed(false), 5000);
            return;
        }
        // Step 2: CONFIRM — the exact chat-screen abort path (SessionView's
        // handleAbort): reset agent overrides, then the sessionRPC 'abort'.
        if (disarmTimer.current) clearTimeout(disarmTimer.current);
        setHaltArmed(false);
        setHaltState('sent');
        storage.getState().resetSessionAgentOverrides(sessionId);
        sessionAbort(sessionId).catch(() => setHaltState('failed'));
    }, [haltArmed, sessionId]);

    return (
        <View style={styles.laneHands}>
            <View style={[styles.laneHandsRow, { gap: Math.max(6, Math.round(d.cardGap * 0.8)) }]}>
                {/* No-op Pressable wrapper: on web a raw TextInput's click BUBBLES to
                    the tile's outer Pressable and navigates to the session instead of
                    focusing the input (dogfood-caught defect). A nested Pressable
                    swallows the press the same way the halt button and the expand
                    chevron already do; the DOM input still focuses natively. */}
                <Pressable style={styles.laneHandsInputWrap} onPress={() => { }}>
                    <TextInput
                        style={[
                            styles.laneHandsInput,
                            { fontSize: scaled(13, d.typeScale), minHeight: d.minTouchSize },
                        ]}
                        value={draft}
                        onChangeText={setDraft}
                        placeholder="steer — inject context, no keystrokes"
                        placeholderTextColor={theme.colors.textSecondary}
                        onSubmitEditing={submitSteer}
                        returnKeyType="send"
                        blurOnSubmit={false}
                    />
                </Pressable>
                <Pressable
                    onPress={onHaltPress}
                    style={[
                        styles.laneHandsHalt,
                        { minHeight: d.minTouchSize, minWidth: Math.max(d.minTouchSize, 64) },
                        haltArmed && styles.laneHandsHaltArmed,
                    ]}
                >
                    <Text style={[
                        styles.laneHandsHaltText,
                        { fontSize: scaled(12, d.typeScale) },
                        haltArmed && styles.laneHandsHaltTextArmed,
                    ]}>
                        {haltArmed ? 'confirm halt' : 'halt'}
                    </Text>
                </Pressable>
            </View>
            {steerState === 'steered' ? (
                <Text style={[styles.laneHandsChip, { fontSize: scaled(11, d.typeScale) }]}>steered ·</Text>
            ) : steerState === 'failed' ? (
                <Text style={[styles.laneHandsChipFailed, { fontSize: scaled(11, d.typeScale) }]}>steer failed — didn't reach the lane</Text>
            ) : null}
            {haltState === 'sent' ? (
                <Text style={[styles.laneHandsChip, { fontSize: scaled(11, d.typeScale) }]}>halt sent — watch the lane state</Text>
            ) : haltState === 'failed' ? (
                <Text style={[styles.laneHandsChipFailed, { fontSize: scaled(11, d.typeScale) }]}>halt failed — lane didn't take the abort</Text>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create((theme) => ({
    // --- LANE HANDS (Mission A1: steer + gated halt) ---
    laneHands: {
        marginTop: 10,
    },
    laneHandsRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    laneHandsInputWrap: {
        flex: 1,
        minWidth: 0,
    },
    laneHandsInput: {
        width: '100%',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.divider,
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 6,
        fontSize: 13,
        color: theme.colors.text,
        backgroundColor: theme.colors.groupped.background,
        ...Typography.default(),
    },
    laneHandsHalt: {
        borderRadius: 8,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.divider,
        backgroundColor: 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 12,
    },
    laneHandsHaltArmed: {
        // Armed = destructive-red, the codebase's one alarm color (RED/ACCENT_GATE).
        backgroundColor: RED,
        borderColor: RED,
    },
    laneHandsHaltText: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        ...Typography.default('semiBold'),
    },
    laneHandsHaltTextArmed: {
        color: '#FFFFFF',
    },
    laneHandsChip: {
        marginTop: 6,
        fontSize: 11,
        color: theme.colors.textSecondary,
        fontStyle: 'italic',
        ...Typography.default(),
    },
    laneHandsChipFailed: {
        marginTop: 6,
        fontSize: 11,
        color: RED,
        ...Typography.default('semiBold'),
    },
}));
