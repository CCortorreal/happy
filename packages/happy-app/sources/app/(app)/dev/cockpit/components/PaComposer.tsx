import * as React from 'react';
import { View, TextInput, Pressable } from 'react-native';
import { Text } from '@/components/StyledText';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { useCongressRoster } from '@/hooks/useCongressRoster';
import { deriveLiveness } from '@/sync/liveness';
import { sendPa } from '@/sync/apiCongressOps';
import { ACCENT_ROUTINE } from '../colors';

// ============================================================================
// PA COMPOSER (CKP-19) — the operator rail's broadcast dock. One input + a
// two-step guarded PA button. A PA fans one message into EVERY live host seat
// inbox — expensive attention — so it is arm→confirm, never a one-tap fire.
//
// Honest-state discipline: the ARM prompt names the pre-count ("→ {liveCount}
// seats", derived exactly the way CockpitHeader derives its headline) but the
// ACK reports SERVER TRUTH — `written`, the count of inboxes that actually
// received it, because the server names exactly who got it and the client's
// pre-count can't. A rate-limit renders honestly with the real retry window;
// an unreachable membrane / network failure reads LOUD, never a fake success.
// ============================================================================

const ARM_DISARM_MS = 5000;

type PaAck =
    | { kind: 'none' }
    | { kind: 'sent'; written: number }
    | { kind: 'rate-limited'; retrySecs: number }
    | { kind: 'failed'; message: string };

export const PaComposer = React.memo(function PaComposer() {
    const { theme } = useUnistyles();
    const { sessions, workers, unreachable } = useCongressRoster();
    const [draft, setDraft] = React.useState('');
    const [armed, setArmed] = React.useState(false);
    const [sending, setSending] = React.useState(false);
    const [ack, setAck] = React.useState<PaAck>({ kind: 'none' });
    const disarmTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    React.useEffect(() => () => { if (disarmTimer.current) clearTimeout(disarmTimer.current); }, []);

    // liveCount — the SAME derivation CockpitHeader uses (alive/idle/wedged = present).
    const liveCount = React.useMemo(() => {
        const seats = [...sessions.values(), ...workers];
        let live = 0;
        for (const seat of seats) {
            const { verdict } = deriveLiveness(seat, unreachable);
            if (verdict === 'alive' || verdict === 'idle' || verdict === 'wedged') live += 1;
        }
        return live;
    }, [sessions, workers, unreachable]);

    const disarm = React.useCallback(() => {
        if (disarmTimer.current) clearTimeout(disarmTimer.current);
        setArmed(false);
    }, []);

    const onPaPress = React.useCallback(async () => {
        if (sending) return;
        if (!armed) {
            // Step 1: ARM — the loud-but-not-destructive routine accent.
            setArmed(true);
            setAck({ kind: 'none' });
            if (disarmTimer.current) clearTimeout(disarmTimer.current);
            disarmTimer.current = setTimeout(() => setArmed(false), ARM_DISARM_MS);
            return;
        }
        // Step 2: BROADCAST.
        if (disarmTimer.current) clearTimeout(disarmTimer.current);
        setArmed(false);
        const message = draft.trim();
        if (!message) { setAck({ kind: 'failed', message: 'PA needs a message' }); return; }
        setSending(true);
        const result = await sendPa(message);
        setSending(false);
        if (result.kind === 'ok') {
            setDraft('');
            // Server truth — `written` is who actually got it, never the pre-count.
            setAck({ kind: 'sent', written: result.written });
        } else if (result.kind === 'rate-limited') {
            setAck({ kind: 'rate-limited', retrySecs: Math.ceil(result.retryAfterMs / 1000) });
        } else {
            setAck({ kind: 'failed', message: result.message });
        }
    }, [armed, sending, draft]);

    const buttonLabel = sending
        ? 'sending…'
        : armed
            ? `confirm PA → ${liveCount} seats`
            : 'PA';

    return (
        <View style={styles.composer}>
            <View style={styles.row}>
                <TextInput
                    style={styles.input}
                    value={draft}
                    onChangeText={setDraft}
                    placeholder="PA — broadcast to all live seats"
                    placeholderTextColor={theme.colors.textSecondary}
                    editable={!sending}
                />
                <Pressable
                    onPress={onPaPress}
                    disabled={sending}
                    style={[styles.paButton, armed && styles.paButtonArmed, sending && styles.paButtonSending]}
                >
                    <Text style={[styles.paButtonText, armed && styles.paButtonTextArmed]} numberOfLines={1}>
                        {buttonLabel}
                    </Text>
                </Pressable>
            </View>
            {ack.kind === 'sent' ? (
                <Text style={styles.ackOk}>{`PA → ${ack.written} seat${ack.written === 1 ? '' : 's'}`}</Text>
            ) : ack.kind === 'rate-limited' ? (
                <Text style={styles.ackLoud}>{`PA rate-limited — retry in ${ack.retrySecs}s`}</Text>
            ) : ack.kind === 'failed' ? (
                <Text style={styles.ackLoud}>{ack.message}</Text>
            ) : null}
        </View>
    );
});

const styles = StyleSheet.create((theme) => ({
    composer: {
        marginBottom: 24,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    input: {
        flex: 1,
        minHeight: 40,
        backgroundColor: theme.colors.input.background,
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 8,
        fontSize: 14,
        color: theme.colors.text,
        ...Typography.default(),
    },
    paButton: {
        minHeight: 40,
        borderRadius: 10,
        borderWidth: 1.5,
        borderColor: ACCENT_ROUTINE,
        backgroundColor: 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 14,
    },
    paButtonArmed: {
        backgroundColor: ACCENT_ROUTINE,
        borderColor: ACCENT_ROUTINE,
    },
    paButtonSending: {
        opacity: 0.5,
    },
    paButtonText: {
        fontSize: 13,
        color: ACCENT_ROUTINE,
        ...Typography.default('semiBold'),
    },
    paButtonTextArmed: {
        color: '#FFFFFF',
    },
    ackOk: {
        marginTop: 6,
        fontSize: 11,
        color: theme.colors.textSecondary,
        fontStyle: 'italic',
        ...Typography.default(),
    },
    ackLoud: {
        marginTop: 6,
        fontSize: 11,
        color: theme.colors.box.error.text,
        ...Typography.default('semiBold'),
    },
}));
