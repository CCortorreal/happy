#!/usr/bin/env node
/*
 * build-selfhost — builds the self-host Tauri daily driver with the server URL
 * baked in, GUARDED so a mis-baked (silently prod-default) artifact can never
 * ship. See docs/lane-happy-dev (bird-1): a plain `tauri:build:production` runs
 * the export WITHOUT EXPO_PUBLIC_HAPPY_SERVER_URL, so getServerUrl falls back to
 * the prod default — which is exactly how a prod-targeting installer shipped.
 *
 * Flow:
 *   1. Export the web bundle with EXPO_PUBLIC_HAPPY_SERVER_URL set.
 *   2. GUARD: fail fast if the URL did not inline into the dist JS.
 *   3. Bundle from the verified dist WITHOUT re-exporting (beforeBuildCommand
 *      suppressed via tauri.nobefore.conf.json) so the verified bundle ships.
 *
 * URL: EXPO_PUBLIC_HAPPY_SERVER_URL env, else the self-host mesh default.
 */
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SERVER_URL = process.env.EXPO_PUBLIC_HAPPY_SERVER_URL || 'http://100.64.0.2:3005';
const DIST_JS = 'dist/_expo/static/js/web';

function run(cmd, extraEnv) {
    console.log(`\n> ${cmd}`);
    execSync(cmd, { stdio: 'inherit', env: { ...process.env, ...extraEnv } });
}

// 1. Export with the server URL baked in. --clear is REQUIRED: Metro caches the
// transformed serverConfig module, so without it a build reuses a stale,
// un-baked copy (EXPO_PUBLIC inlined from a previous non-env build) and the URL
// silently won't bake — the exact failure the guard below catches.
run('pnpm exec expo export --platform web --output-dir dist --clear', { EXPO_PUBLIC_HAPPY_SERVER_URL: SERVER_URL });

// 2. GUARD — verify the URL actually inlined into the JS bundle.
const host = SERVER_URL.replace(/^https?:\/\//, '');
const baked = readdirSync(DIST_JS)
    .filter((f) => f.endsWith('.js'))
    .some((f) => readFileSync(join(DIST_JS, f), 'utf8').includes(host));
if (!baked) {
    console.error(`\n✗ GUARD FAILED: '${host}' not found in dist JS — server URL did not bake. Aborting before bundle.`);
    process.exit(1);
}
console.log(`\n✓ GUARD: '${host}' is baked into dist.`);

// 3. Bundle from the verified dist without re-exporting. HAPPY_SELFHOST_URL is
// read at COMPILE time by option_env! in lib.rs to bake the durable
// __HAPPY_CONFIG__.serverUrl default (build.rs reruns on change). This is the
// primary, Metro-cache-immune mechanism; the EXPO_PUBLIC bake above is a backup.
run('pnpm exec tauri build --config src-tauri/tauri.nobefore.conf.json', { HAPPY_SELFHOST_URL: SERVER_URL });
console.log('\n✓ Self-host installer built from verified dist.');
