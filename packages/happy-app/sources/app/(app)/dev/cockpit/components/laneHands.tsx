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
// LANE HANDS (Mission A1 / CKP-18) — steer + gated halt. The cockpit gets hands,
// mirroring the building's control register:
//   STEER — injects context into the lane's underlying session via the EXACT
//     send path the session chat screen uses (sync.sendMessage source:'chat',
//     see SessionView.tsx handleSend) — no new transport, no keystroke
//     simulation. The ack is honest: an optimistic "steered ·" chip (we sent
//     it, nothing more claimed) and then the live tail itself shows the
//     effect. A send that throws reads LOUD ("steer failed"), never quiet.
//   HALT — wired to Happy's existing abort primitive (sessionAbort in
//     sync/ops.ts — the same sessionRPC 'abort' the chat screen's stop button
//     fires, including the resetSessionAgentOverrides it does first). Two-
//     step: arm (destructive-red "confirm halt"), confirm within 5s executes,
//     else disarms. "halt sent" is the strongest claim made — the lane's own
//     honest state shows whether it actually stopped.
//
// ONE transport, no forks (C15): both the inline tile hands (LaneHands below)
// AND the desktop OperatorPane consume `useLaneHands(sessionId)`. There is
// exactly one send/halt implementation — the pane and the tile can never
// disagree about what "steered" or "halt sent" means because they share this
// hook. `LaneHands` keeps its unchanged `{ sessionId }` props (LaneTile imports
// it) and simply renders the hook's state.
// ----------------------------------------------------------------------------

export type SteerState = 'idle' | 'sent' | 'failed';
// Halt is a richer state machine than steer because CKP-20 (the OperatorPane
// HALT) must never claim success the feed hasn't confirmed: after 'firing' the
// caller watches the lane's honest state and only then returns to 'idle'. The
// inline tile hands use the simpler subset (idle → armed → firing → sent/failed)
// but the machine is shared so both surfaces agree.
export type HaltState = 'idle' | 'armed' | 'firing' | 'sent' | 'failed';

export interface LaneHandsController {
    draft: string;
    setDraft: (v: string) => void;
    // Fire the steer send (source:'chat'). No-op on empty/whitespace draft.
    send: () => void;
    steerState: SteerState;
    haltState: HaltState;
    // Step 1: arm the halt. Auto-disarms after 5s if fireHalt isn't called.
    armHalt: () => void;
    // Cancel an armed halt (timeout, or any other press in the pane per CKP-20).
    disarmHalt: () => void;
    // Step 2: fire the abort. Only meaningful while armed; sets 'firing' then
    // 'sent' on transport success (delivery-attempt claim only), 'failed' on throw.
    fireHalt: () => void;
}

const STEER_CHIP_MS = 8000;
const HALT_DISARM_MS = 5000;

// The single send/halt implementation. Both the inline tile hands and the
// desktop OperatorPane derive their controls from this — zero forked paths.
export function useLaneHands(sessionId: string): LaneHandsController {
    const [draft, setDraft] = React.useState('');
    const [steerState, setSteerState] = React.useState<SteerState>('idle');
    const [haltState, setHaltState] = React.useState<HaltState>('idle');
    const steerChipTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const disarmTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    React.useEffect(() => () => {
        if (steerChipTimer.current) clearTimeout(steerChipTimer.current);
        if (disarmTimer.current) clearTimeout(disarmTimer.current);
    }, []);

    const send = React.useCallback(() => {
        const text = draft.trim();
        if (!text) return;
        setDraft('');
        // Optimistic chip — "sent" claims only that the send was fired; the live
        // tail above is the real evidence of effect (no fake ack).
        setSteerState('sent');
        if (steerChipTimer.current) clearTimeout(steerChipTimer.current);
        steerChipTimer.current = setTimeout(() => setSteerState('idle'), STEER_CHIP_MS);
        // sync.sendMessage is the EXACT chat-screen send path (SessionView handleSend).
        sync.sendMessage(sessionId, text, { source: 'chat' }).catch(() => {
            if (steerChipTimer.current) clearTimeout(steerChipTimer.current);
            setSteerState('failed');
        });
    }, [draft, sessionId]);

    const armHalt = React.useCallback(() => {
        setHaltState('armed');
        if (disarmTimer.current) clearTimeout(disarmTimer.current);
        disarmTimer.current = setTimeout(() => {
            // Only disarm if still armed — a fire in the window already advanced state.
            setHaltState((s) => (s === 'armed' ? 'idle' : s));
        }, HALT_DISARM_MS);
    }, []);

    const disarmHalt = React.useCallback(() => {
        if (disarmTimer.current) clearTimeout(disarmTimer.current);
        setHaltState((s) => (s === 'armed' ? 'idle' : s));
    }, []);

    const fireHalt = React.useCallback(() => {
        if (disarmTimer.current) clearTimeout(disarmTimer.current);
        setHaltState('firing');
        // The exact chat-screen abort path (SessionView handleAbort): reset agent
        // overrides, then the sessionRPC 'abort'. 'sent' claims delivery-attempt
        // only — CKP-20's caller watches the honest feed to learn the outcome.
        storage.getState().resetSessionAgentOverrides(sessionId);
        sessionAbort(sessionId)
            .then(() => setHaltState('sent'))
            .catch(() => setHaltState('failed'));
    }, [sessionId]);

    return { draft, setDraft, send, steerState, haltState, armHalt, disarmHalt, fireHalt };
}

export function LaneHands({ sessionId }: { sessionId: string }) {
    const { theme } = useUnistyles();
    const d = useDensity();
    const hands = useLaneHands(sessionId);
    const haltArmed = hands.haltState === 'armed';

    const onHaltPress = React.useCallback(() => {
        if (hands.haltState === 'armed') {
            hands.fireHalt();
        } else {
            hands.armHalt();
        }
    }, [hands]);

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
                        value={hands.draft}
                        onChangeText={hands.setDraft}
                        placeholder="steer — inject context, no keystrokes"
                        placeholderTextColor={theme.colors.textSecondary}
                        onSubmitEditing={hands.send}
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
            {hands.steerState === 'sent' ? (
                <Text style={[styles.laneHandsChip, { fontSize: scaled(11, d.typeScale) }]}>steered ·</Text>
            ) : hands.steerState === 'failed' ? (
                <Text style={[styles.laneHandsChipFailed, { fontSize: scaled(11, d.typeScale) }]}>steer failed — didn't reach the lane</Text>
            ) : null}
            {hands.haltState === 'sent' ? (
                <Text style={[styles.laneHandsChip, { fontSize: scaled(11, d.typeScale) }]}>halt sent — watch the lane state</Text>
            ) : hands.haltState === 'failed' ? (
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
