import * as React from 'react';
import { View, Text } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { SessionsList } from '@/components/SessionsList';
import { SessionListViewItem, SessionRowData } from '@/sync/storage';
import { CongressSeat } from '@/sync/congressTypes';

// Hearth Phase 0 — dev-only RENDERING PREVIEW.
//
// Feel-first artifact for Carlos: it drives the REAL SessionsList render path
// (the production SessionItem cards, the Hearthside grouping via the real
// buildHearthsideViewData transform, role/pedal subtitle, oracle-verdict
// liveness dots) — only the DATA BINDING is injected via SessionsList's preview
// seam. What you see here IS what ships once the route merges.
//
// The roster rows below are the REAL live congress (pulled from
// ~/.happy-selfhost/congress-roster.json on 2026-06-28, post honest-teardown:
// 8 lanes, all ALIVE — the clean floor). Dev page → exempt from i18n.
//
// The true on-device dogfood (live, auto-updating, account-scoped JOIN) needs no
// special bring-up: Carlos's own authed client renders these rows naturally the
// moment the route merges. This preview only breaks the chicken-egg of "no-push
// until Carlos reacts / Carlos reacts to the merged thing."

// Real congress lanes (seat / cuid / role / pedal / verdict) from the live feed.
const CONGRESS_LANES: { seat: string; cuid: string; role: string; pedal: string; verdict: string; pid: number }[] = [
    { seat: 'overseer', cuid: 'cmqy1b4ck011cmbzoocsku450', role: 'overseer', pedal: 'warden-stack-survival', verdict: 'ALIVE', pid: 10160 },
    { seat: 'loom', cuid: 'cmqycgplb0hnsmbzohtr768z0', role: 'design-research', pedal: 'unifying-surface', verdict: 'ALIVE', pid: 36804 },
    { seat: 'happy-dev', cuid: 'cmqycgley0hnimbzomevzfhbz', role: 'happy-dev', pedal: 'hearth-build', verdict: 'ALIVE', pid: 28008 },
    { seat: 'infra', cuid: 'cmqycgnjh0hnnmbzojpxygejn', role: 'infra', pedal: 'hearth-substrate', verdict: 'ALIVE', pid: 20424 },
    { seat: 'ai-ops', cuid: 'cmqycr0uq0ilsmbzokw85xiz2', role: 'ai-ops', pedal: 'auto-compact-mgmt', verdict: 'ALIVE', pid: 35308 },
    { seat: 'reaper', cuid: 'cmqyd4i5o0khhmbzo5umt9odj', role: 'security-mesh', pedal: 'digest-headscale', verdict: 'ALIVE', pid: 40860 },
    { seat: 'aegis', cuid: 'cmqyd4kcw0kiimbzopcuanrui', role: 'security-host', pedal: 'digest-hardening', verdict: 'ALIVE', pid: 40908 },
    { seat: 'device-health', cuid: 'cmqyd4mki0kizmbzoe504o634', role: 'device-health', pedal: 'digest-device', verdict: 'ALIVE', pid: 33352 },
];

function makeSession(id: string, name: string, overrides: Partial<SessionRowData> = {}): SessionRowData {
    return {
        id,
        name,
        subtitle: '',
        avatarId: id,
        flavor: null,
        state: 'waiting',
        hasDraft: false,
        active: true,
        machineId: 'CarlosPC',
        path: null,
        homeDir: null,
        completedTodosCount: 0,
        totalTodosCount: 0,
        hasUnread: false,
        claudeSessionId: null,
        ...overrides,
    };
}

// Roster keyed by cuid (= session id) — the JOIN key the real transform uses.
const previewRoster: Map<string, CongressSeat> = new Map(
    CONGRESS_LANES.map((l) => [
        l.cuid,
        {
            seat: l.seat, cuid: l.cuid, verdict: l.verdict, kind: 'session',
            role: l.role, pedal: l.pedal, host: 'CarlosPC', pid: l.pid,
            model: null, warm: null, vramMB: null, currentWork: null, workStatus: null, startedAt: null,
        } satisfies CongressSeat,
    ])
);

// A worker lane (cuid:null) to showcase the watched-not-conversable WorkerCard.
const previewWorkers: CongressSeat[] = [
    {
        seat: 'brain-3090', cuid: null, verdict: 'ALIVE', kind: 'worker',
        role: 'pull-worker', pedal: null, host: 'CarlosPC', pid: 30352,
        model: 'qwen3:30b', warm: true, vramMB: 19200,
        currentWork: 'drafting i18n for the for-carlos cards', workStatus: 'working', startedAt: null,
    },
];

// Raw list: the 8 congress lanes (which the transform lifts into Hearthside) plus
// a couple of ordinary sessions under a date header, so the lift reads clearly.
const previewData: SessionListViewItem[] = [
    ...CONGRESS_LANES.map((l): SessionListViewItem => ({
        type: 'session',
        session: makeSession(l.cuid, l.seat),
    })),
    { type: 'header', title: 'Today' },
    { type: 'session', session: makeSession('preview-plain-1', 'happy', { path: '/Users/carlos/Desktop/projects/happy', state: 'waiting' }) },
    { type: 'session', session: makeSession('preview-plain-2', 'parthenogenesis', { path: '/Users/carlos/Desktop/projects/parthenogenesis', state: 'disconnected', active: false, activeAt: 1751145000000 }) },
];

export default function HearthPreviewScreen() {
    return (
        <View style={styles.container}>
            <View style={styles.banner}>
                <Text style={styles.bannerText}>RENDERING PREVIEW · real roster data · on-device dogfood pending merge</Text>
            </View>
            <SessionsList previewData={previewData} previewRoster={previewRoster} previewWorkers={previewWorkers} />
        </View>
    );
}

const styles = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.colors.groupped.background,
    },
    banner: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: '#FFE8A3',
        alignItems: 'center',
    },
    bannerText: {
        fontSize: 11,
        fontWeight: '600',
        color: '#5A4A00',
        letterSpacing: 0.2,
    },
}));
