import * as React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/StyledText';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { layout } from './layout';
import { useVram } from '@/hooks/useVram';
import { FeedUnreachable } from '@/components/HonestSignal';
import { gb } from '@/sync/vramTypes';

// VramGauge — Hearth MONITOR pillar (the VRAM-visibility cut Carlos named). Reads
// device-health's vram-engine.json via GET /v1/vram and shows: the GPU used/free
// bar, the qwen3-HEADROOM verdict (the sovereignty gap as a live reading + the
// razor-thin margin), and the top consumers split LOCKED (🔒 never-touch —
// structurally unfreeable: dwm/sunshine/model/claude) vs RECLAIMABLE (♻ allowlist).
// Honesty-spine: a broken/unreadable engine reads LOUD ("can't read the GPU"), never
// a silent zero; locked vs free-able is shown clearly (you see what's untouchable).
//
// READ-ONLY. The free-VRAM button (preview-then-confirm, loom's safety-UX) is a
// separate guarded write-path wired once device-health's safe-free action contract
// lands. loom owns the FEEL + placement + the final locked/reclaimable visual;
// this is the build scaffold to tune. Strings plain pending loom's i18n pass.

const GREEN = '#34C759';
const AMBER = '#FF9500';
const RED = '#E5484D';
const RAZOR_THIN_MB = 2048;   // < ~2GB headroom = fits-but-barely (amber, not green)

function pressureColor(usedFrac: number): string {
    if (usedFrac >= 0.9) return RED;
    if (usedFrac >= 0.75) return AMBER;
    return GREEN;
}

export function VramGauge() {
    const { theme } = useUnistyles();
    const { view, unreachable } = useVram();

    if (unreachable) {
        // Honest-dead via the shared cross-pillar signal (#0 invariant) — never a
        // fake-fresh "0GB used". String stays plain pending loom's i18n pass.
        return (
            <View style={styles.container}>
                <FeedUnreachable message="can’t read the GPU right now" />
            </View>
        );
    }
    if (!view) {
        return null; // no data yet / not present — quiet, never a fake zero
    }

    const usedFrac = view.totalMB > 0 ? view.usedMB / view.totalMB : 0;
    const barColor = pressureColor(usedFrac);

    // The qwen3-headroom verdict — the load-bearing sovereignty signal (loom's
    // feel-tune): lead with the plain villager YES/NO, THEN the margin. Honest-fit:
    // razor-thin headroom while loaded reads AMBER, never a confident green over a
    // model that's about to spill/thrash. (True spill needs a tok/s signal the engine
    // doesn't emit yet — flagged; razor-thin-margin is the honest proxy until then.)
    let verdict: string | null = null;
    let verdictColor = GREEN;
    const h = view.headroom;
    const t = view.throughput;
    if (h?.state) {
        // device-health's AUTHORITATIVE honest-fit band — paint by it (proven-fast
        // green / unambiguous-thrash red / uncertain amber). Lead with live tok/s
        // when fresh; the why is device-health's honest stateBasis (loom tunes the
        // wording). This replaces the size-math proxy — never a lying green.
        verdictColor = h.state === 'green' ? GREEN : h.state === 'red' ? RED : AMBER;
        const tok = t?.fresh && t.tokPerSec != null ? `${Math.round(t.tokPerSec)} tok/s · ` : '';
        const why = h.stateBasis
            ?? (h.state === 'green' ? 'qwen3 running' : h.state === 'red' ? 'qwen3 stalled' : 'qwen3 tight');
        verdict = `${tok}${why}`;
    } else if (h) {
        // Fallback proxy (pre-honest-fit feed): size-math + razor-thin margin -> amber.
        if (!h.fits) {
            verdict = `qwen3 won’t fit — ${gb(h.shortByMB)} short`;
            verdictColor = AMBER;
        } else if (h.loaded && h.marginMB < RAZOR_THIN_MB) {
            verdict = `qwen3 loaded — ${gb(h.marginMB)} to spare, razor-thin`;
            verdictColor = AMBER;
        } else if (h.loaded) {
            verdict = `qwen3 loaded — ${gb(h.marginMB)} to spare`;
            verdictColor = GREEN;
        } else {
            verdict = `qwen3 fits — ${gb(h.marginMB)} to spare`;
            verdictColor = GREEN;
        }
    }

    const consumers = [...view.consumers].sort((a, b) => b.vramMB - a.vramMB).slice(0, 6);

    // VRAM-pressure trend — the MONITOR law is level + RATE + ETA (loom; the disk-
    // sentinel's etaToActDays set the precedent). Rising adds time-to-impact
    // (eta = freeMB / rate) so Carlos sees WHEN it gets tight, not just that it's
    // climbing. Honest-NULL the eta on a flat/falling trend (never a faked countdown),
    // and the whole line is honest-null while warming (|rate| < 1MB/min).
    let trend: string | null = null;
    let trendColor = GREEN;
    const rate = view.pressureMBPerMin;
    if (rate != null && Math.abs(rate) >= 1) {
        if (rate > 0) {
            trendColor = AMBER;
            const etaMin = view.freeMB > 0 ? Math.round(view.freeMB / rate) : 0;
            trend = etaMin >= 1
                ? `VRAM filling +${Math.round(rate)}MB/min — ~${etaMin}min to tight`
                : `VRAM filling +${Math.round(rate)}MB/min`;
        } else {
            trend = `VRAM draining ${Math.round(rate)}MB/min`;
        }
    }

    return (
        <View style={styles.container}>
            <View style={styles.headerRow}>
                <Text style={styles.title} numberOfLines={1}>{view.name ?? 'GPU'}</Text>
                <Text style={styles.headerNums}>
                    {gb(view.usedMB)} / {gb(view.totalMB)} · {gb(view.freeMB)} free
                </Text>
            </View>

            <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${Math.min(100, Math.round(usedFrac * 100))}%`, backgroundColor: barColor }]} />
            </View>

            {verdict ? (
                <Text style={[styles.verdict, { color: verdictColor }]} numberOfLines={2}>{verdict}</Text>
            ) : null}

            {consumers.map((c, i) => (
                <View key={`${c.name}-${c.pid ?? i}`} style={styles.consumerRow}>
                    {/* loom: protected = lock (kept by design, muted); ORPHAN = warning
                        (stale dead-parent — never auto-freed but a Carlos-confirmed-kill
                        candidate, DIFFERENT reason than protected); reclaimable = absence
                        of glyph (no 'refresh' — reads as reload). */}
                    {c.orphan ? (
                        <Ionicons name="warning-outline" size={11} color={AMBER} style={styles.consumerIcon} />
                    ) : c.locked ? (
                        <Ionicons name="lock-closed" size={11} color={theme.colors.textSecondary} style={styles.consumerIcon} />
                    ) : (
                        <View style={styles.consumerIconSpacer} />
                    )}
                    <Text style={[
                        styles.consumerName,
                        c.locked && !c.orphan && styles.consumerLocked,
                    ]} numberOfLines={1}>{c.orphan ? `${c.name} · stale` : c.name}</Text>
                    <Text style={styles.consumerMB}>{gb(c.vramMB)}</Text>
                </View>
            ))}

            {/* level + RATE + ETA — honest-null while warming / on a flat trend. */}
            {trend ? (
                <Text style={[styles.trend, { color: trendColor }]} numberOfLines={1}>{trend}</Text>
            ) : null}

            {view.reclaimableMB > 0 ? (
                <Text style={styles.reclaimable} numberOfLines={1}>
                    ~{gb(view.reclaimableMB)} safely reclaimable
                </Text>
            ) : null}

            {view.orphanNote ? (
                <Text style={styles.orphan} numberOfLines={2}>{view.orphanNote}</Text>
            ) : null}

            {/* The free-VRAM button mounts here once device-health's safe-free action
                contract lands — preview-then-confirm (loom's safety-UX), never auto-
                execute, never able to touch the 🔒 locked class. */}
        </View>
    );
}

const styles = StyleSheet.create((theme) => ({
    container: {
        width: '100%',
        maxWidth: layout.maxWidth,
        alignSelf: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        // Reserved card height (PR-21) — consumer-list churn, trend-line null-toggle,
        // and verdict/reclaimable/orphanNote conditionals must never reflow the list
        // below. Sized to the common live-card shape (header + bar + verdict + a
        // couple consumer rows); a sparser card just has quiet whitespace below.
        minHeight: 180,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
    },
    title: {
        flex: 1,
        fontSize: 13,
        color: theme.colors.text,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        ...Typography.default('semiBold'),
    },
    headerNums: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        ...Typography.default(),
    },
    barTrack: {
        height: 8,
        borderRadius: 4,
        backgroundColor: theme.colors.groupped.background,
        overflow: 'hidden',
    },
    barFill: {
        height: 8,
        borderRadius: 4,
    },
    verdict: {
        fontSize: 12,
        marginTop: 8,
        ...Typography.default('semiBold'),
    },
    trend: {
        fontSize: 11,
        marginTop: 4,
        ...Typography.default(),
    },
    consumerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 6,
    },
    consumerIcon: {
        width: 14,
        textAlign: 'center',
    },
    consumerIconSpacer: {
        width: 14,
    },
    consumerName: {
        flex: 1,
        fontSize: 12,
        color: theme.colors.text,
        ...Typography.mono(),
    },
    consumerLocked: {
        color: theme.colors.textSecondary,
    },
    consumerMB: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        ...Typography.default('semiBold'),
    },
    reclaimable: {
        fontSize: 12,
        color: GREEN,
        marginTop: 8,
        ...Typography.default('semiBold'),
    },
    orphan: {
        fontSize: 11,
        color: theme.colors.textSecondary,
        lineHeight: 15,
        marginTop: 6,
        fontStyle: 'italic',
        ...Typography.default(),
    },
}));
