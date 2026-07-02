import * as React from 'react';
import { View } from 'react-native';
import { Text } from '@/components/StyledText';
import { StyleSheet } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { StatusDot } from '@/components/StatusDot';
import { useVitalHistory, VitalKey } from '@/hooks/useVitalHistory';
import { GREY } from '../colors';

// ============================================================================
// VitalGaugeCard (CKP-15) — a single glanceable vital rendered as a fixed-height
// gauge card (label + big value / bar / sparkline + detail). Hand-rolled Views only,
// no deps. Fixed 64px collapsed height (G20: a flapping feed never reflows the rail).
//
// Honest-state discipline is baked in via the `status` prop (from useHonestFeed):
//   - BINDING  -> empty track, no fill, no spark, value 'reading…' grey, calm dot.
//                 (still settling — never a saturated bar, never a confident alarm.)
//   - DEAD + last-known view -> value 'can't read' RED, red dot, last-known fill at
//                 opacity 0.3, sub-line 'last read {age} ago' (stale renders stale).
//   - DEAD + never-had-data  -> 'unavailable — can't read {label}' RED, empty track.
//   - LIVE     -> the real value/bar/spark, bar color STRICTLY from a fresh warn read.
// A color is NEVER painted without a fresh read behind it — the bar/spark only take a
// state color in the LIVE branch; DEAD dims last-known, BINDING shows nothing.
// ============================================================================

export type VitalGaugeStatus = 'binding' | 'live' | 'dead';

export interface VitalGaugeCardProps {
    vitalKey: VitalKey;
    label: string;                 // e.g. 'VRAM'
    status: VitalGaugeStatus;
    // The big value string when LIVE (e.g. '38%', '12') — already formatted by the caller
    // so the card stays presentation-only. Ignored in BINDING/DEAD (honest copy wins).
    value: string;
    // Bar fill 0..1 when LIVE (or last-known when DEAD-with-data, dimmed). null = no bar.
    barPct: number | null;
    // Bar/spark state color when LIVE — the caller passes the warn-predicate color
    // (AMBER/RED/GREEN). Only used in the LIVE branch; DEAD/BINDING never paint it.
    barColor: string;
    // The dot color (already honest-derived by the caller: red when dead, grey when
    // binding, else the warn-predicate color).
    dotColor: string;
    // The current sparkline value (null when not a fresh read) — pushed into the shared
    // ring buffer by useVitalHistory. Only non-null on LIVE settled reads.
    sparkValue: number | null;
    // Detail line under the bar (e.g. '9.9/35.3 GB', '2 to watch', 'queued'). Rendered
    // only when LIVE; DEAD shows the 'last read {age} ago' sub-line instead.
    detail: string;
    // Epoch ms of the last live read, for the DEAD 'last read {age} ago' sub-line.
    lastReadAt: number | null;
}

// A compact "{age} ago" formatter (dev page — i18n-exempt). Coarse on purpose: the
// point is "this is stale", not a stopwatch.
function ageAgo(sinceMs: number): string {
    const s = Math.max(0, Math.round((Date.now() - sinceMs) / 1000));
    if (s < 60) return `${s}s ago`;
    const m = Math.round(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.round(h / 24)}d ago`;
}

// The sparkline: last 30 accepted reads, scaled to the window's own min/max so the
// SHAPE (trend) is readable even for a feed that hovers in a narrow band. Newest slot
// only at full opacity in the state color; the rest are textSecondary at 0.35. Rendered
// only when LIVE (a dead/binding feed shows no spark — absent data renders absent).
function Sparkline({ history, color }: { history: number[]; color: string }) {
    if (history.length === 0) {
        return <View style={styles.sparkRow} />;
    }
    const min = Math.min(...history);
    const max = Math.max(...history);
    const span = max - min;
    const last = history.length - 1;
    return (
        <View style={styles.sparkRow}>
            {history.map((v, i) => {
                // Scale to window; a flat window (span 0) renders a mid-height bar so the
                // spark reads as "steady", not "empty".
                const frac = span > 0 ? (v - min) / span : 0.5;
                const h = 3 + Math.round(frac * 15); // 3..18px within the 18px row
                const isNewest = i === last;
                return (
                    <View
                        key={i}
                        style={[
                            styles.sparkSlot,
                            {
                                height: h,
                                backgroundColor: isNewest ? color : styles.sparkSlotDim.backgroundColor,
                                opacity: isNewest ? 1 : 0.35,
                            },
                        ]}
                    />
                );
            })}
        </View>
    );
}

export const VitalGaugeCard = React.memo((props: VitalGaugeCardProps) => {
    const {
        vitalKey, label, status, value, barPct, barColor, dotColor, sparkValue, detail, lastReadAt,
    } = props;

    // Feed the shared ring buffer. useVitalHistory no-ops on null (dead/binding), so the
    // window only ever holds real reads.
    const history = useVitalHistory(vitalKey, status === 'live' ? sparkValue : null);

    const isBinding = status === 'binding';
    const isDead = status === 'dead';
    const isLive = status === 'live';

    // Value copy: honest per status. DEAD-with-data says 'can't read'; DEAD-never says the
    // long 'unavailable — can't read {label}'. Distinguish by whether we have a bar to dim.
    const hasLastKnown = barPct != null;
    const valueText = isBinding
        ? 'reading…'
        : isDead
            ? (hasLastKnown ? "can't read" : `unavailable — can't read ${label}`)
            : value;

    // Bar: LIVE paints a fresh fill in the state color; DEAD dims the last-known fill to
    // 0.3 (stale renders stale, never a saturated bar over a dead feed); BINDING shows an
    // empty track only.
    const showBar = (isLive || (isDead && hasLastKnown)) && barPct != null;
    const barFillColor = isLive ? barColor : GREY;
    const barFillOpacity = isDead ? 0.3 : 1;

    // Sub-line: LIVE shows the detail; DEAD-with-data shows staleness; BINDING/DEAD-never
    // stay quiet (the value copy already carries the honest state).
    const subLine = isLive
        ? detail
        : (isDead && lastReadAt != null ? `last read ${ageAgo(lastReadAt)}` : null);

    return (
        <View style={styles.card}>
            <View style={styles.row1}>
                <View style={styles.labelWrap}>
                    <StatusDot color={dotColor} size={7} />
                    <Text style={styles.label}>{label}</Text>
                </View>
                <Text
                    style={[styles.value, isDead && styles.valueDead]}
                    numberOfLines={1}
                >
                    {valueText}
                </Text>
            </View>

            <View style={styles.track}>
                {showBar ? (
                    <View
                        style={[
                            styles.fill,
                            {
                                width: `${Math.round(Math.max(0, Math.min(1, barPct!)) * 100)}%`,
                                backgroundColor: barFillColor,
                                opacity: barFillOpacity,
                            },
                        ]}
                    />
                ) : null}
            </View>

            <View style={styles.row3}>
                {isLive ? <Sparkline history={history} color={barColor} /> : <View style={styles.sparkRow} />}
                {subLine ? (
                    <Text style={[styles.detail, isDead && styles.detailDead]} numberOfLines={1}>
                        {subLine}
                    </Text>
                ) : null}
            </View>
        </View>
    );
});

const styles = StyleSheet.create((theme) => ({
    card: {
        height: 64,
        backgroundColor: theme.colors.surface,
        borderRadius: 12,
        paddingHorizontal: 10,
        paddingVertical: 10,
        justifyContent: 'space-between',
        overflow: 'hidden',
    },
    row1: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    labelWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        flexShrink: 1,
    },
    label: {
        fontSize: 11,
        color: theme.colors.groupped.sectionTitle,
        letterSpacing: 0.3,
        ...Typography.default('semiBold'),
    },
    value: {
        fontSize: 17,
        color: theme.colors.text,
        textAlign: 'right',
        flexShrink: 1,
        ...Typography.default('semiBold'),
    },
    valueDead: {
        color: theme.colors.box.error.text,
        fontSize: 12.5,
    },
    track: {
        height: 6,
        borderRadius: 3,
        backgroundColor: theme.colors.surfaceHighest,
        overflow: 'hidden',
    },
    fill: {
        height: 6,
        borderRadius: 3,
    },
    row3: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 8,
    },
    sparkRow: {
        flexDirection: 'row',
        gap: 1,
        height: 18,
        alignItems: 'flex-end',
        flexShrink: 1,
    },
    sparkSlot: {
        width: 3,
        borderRadius: 1,
    },
    // Carries the dim slot color as a token (read off in Sparkline).
    sparkSlotDim: {
        backgroundColor: theme.colors.textSecondary,
    },
    detail: {
        fontSize: 10.5,
        color: theme.colors.textSecondary,
        textAlign: 'right',
        flexShrink: 1,
        ...Typography.default(),
    },
    detailDead: {
        color: theme.colors.box.error.text,
    },
}));
