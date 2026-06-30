# Bundle-size baseline (PR-25)

> Measurement infrastructure only — no optimization here. This establishes the number PR-26 measures against. Per §2 G21/G22 of `final-form-plan.md`: 156 production deps, no bundle-size budget or tracking, no confirmed code-splitting.

## How to reproduce

From `packages/happy-app/`:

```sh
EXPO_UNSTABLE_ATLAS=true npx expo export -p web --output-dir dist-atlas-baseline
```

This is plain Expo SDK 55 built-in tooling (`EXPO_UNSTABLE_ATLAS` env var, no extra package install, no config file needed) — it writes a module-graph trace to `.expo/atlas.jsonl` alongside the normal web export to `dist-atlas-baseline/`. View it interactively with:

```sh
npx expo-atlas .expo/atlas.jsonl
```

(`expo-atlas` is a dev-only viewer, run via `npx` on demand — not added as a project dependency, since it's not needed at build time.)

No `app.json`/`metro.config.js` changes were needed — Atlas is opt-in purely via the env var on SDK 54+, which this repo already runs (`expo: ~55.0.8`).

## Baseline numbers (2026-06-30, commit `fa6cac1`)

**Full web export (`expo export -p web`):**
- Total `dist/` output: **40 MB** (305 JS chunks under `_expo/static/js/web/`, mostly per-language Shiki syntax-highlighting grammars — see below)
- Total JS: **24 MB**

**Initial-load payload** (the 3 chunks `index.html` actually references on first paint — runtime + shared `__common` chunk + the route-zero `index` chunk; everything else is route-split/lazy and not in the critical path):

| Chunk | Raw | Gzip |
|---|---|---|
| `__expo-metro-runtime` | 10 KB | 3.9 KB |
| `__common` (shared vendor chunk) | 6.45 MB | 1.17 MB |
| `index` (entry route) | 8.23 MB | 2.11 MB |
| **Total initial load** | **~14.7 MB raw** | **~3.29 MB gzip** |

**Module graph** (from `.expo/atlas.jsonl`, web platform, client bundle): 7,204 modules, 22.4 MB of summed pre-bundle source — 92.0% (20.6 MB) from `node_modules`, 8.0% (1.8 MB) app source.

## Top 20 packages by bundled source size

| Package | Size |
|---|---|
| `@pierre/diffs` | 10313.6 KB |
| `(app source)` | 1835.2 KB |
| `mermaid` | 1412.9 KB |
| `libsodium-wrappers` | 910.3 KB |
| `@revenuecat/purchases-js` | 692.0 KB |
| `react-native-reanimated` | 657.0 KB |
| `@expo/vector-icons` | 452.4 KB |
| `livekit-client` | 447.9 KB |
| `cytoscape` | 424.4 KB |
| `zod` | 384.1 KB |
| `chevrotain` | 378.2 KB |
| `react-native-web` | 298.8 KB |
| `@chevrotain/gast` | 270.5 KB |
| `@chevrotain/cst-dts-gen` | 265.9 KB |
| `lodash-es` | 263.0 KB |
| `expo-router` | 205.2 KB |
| `react-native-gesture-handler` | 204.2 KB |
| `react-dom` | 177.8 KB |
| `@peoplesgrocers/seti-ui-file-icons` | 166.8 KB |
| `langium` | 140.9 KB |

## Concrete trim/lazy-load candidates for PR-26 (evidence, not guesses)

1. **`@pierre/diffs` — 10.3 MB across 468 modules, the single largest contributor (45% of all node_modules source).** Drilling into its own `node_modules/@shikijs/langs/dist/*.mjs` files shows dozens of full syntax-highlighting grammars bundled eagerly — `emacs-lisp.mjs` (764 KB), `cpp.mjs` (419 KB), `wolfram.mjs` (261 KB), `vue-vine.mjs` (196 KB), `angular-ts.mjs` (187 KB), etc. — languages with no evident connection to this app's actual diff-rendering use case. This is a `@shikijs/langs` bundle-everything default, not a deliberate choice; it's the highest-leverage single fix available (limiting to the actual language set in use, or lazy-loading per-language, would likely cut several MB outright).
2. **`livekit-client` (447.9 KB, 1 chunk) + the voice feature path.** Per the app's own `CLAUDE.md`, web is explicitly "a secondary platform... avoid web-specific implementations" — yet the native voice stack ships its web-targeted client into the default web bundle unconditionally. Candidate for lazy-loading behind the voice-feature entry point (or excluding from the web build path entirely, mirroring the app's own stated platform priority).
3. **`libsodium-wrappers` (910.3 KB, 2 modules) + `@revenuecat/purchases-js` (692 KB, 2 modules).** Both are single-purpose, feature-gated capabilities (crypto, purchases) currently in the eager/initial graph rather than route- or feature-level split. Both are good candidates for `React.lazy`/dynamic `import()` behind their respective feature entry points now that Expo Router v6 (already in use, `expo-router: ~55.0.7`) supports per-page async bundles — directly actionable for PR-26's "route-level code splitting" scope.

(Runner-up not in the top-3 but worth flagging for PR-26's research: `mermaid` 1.41 MB + `cytoscape` 424 KB + `chevrotain` 378 KB + `@chevrotain/gast` 271 KB + `@chevrotain/cst-dts-gen` 266 KB + `langium` 141 KB are all diagramming/parser-toolkit dependencies, likely all pulled in together for one feature — worth checking if that feature is route-isolated.)

## Verification performed

- Ran `pnpm install` clean in the PR worktree (shared pnpm content-addressable store, no fresh downloads needed — 57.6s).
- Ran `EXPO_UNSTABLE_ATLAS=true npx expo export -p web --output-dir dist-atlas-baseline` from `packages/happy-app/` — **succeeded**, exited 0, produced both the static web export and `.expo/atlas.jsonl`.
- Parsed `.expo/atlas.jsonl` (7,204-module graph) with a one-off Node script to aggregate per-package size — confirmed numbers above against direct `ls -la`/`gzip -c | wc -c` measurements of the actual exported chunks (cross-checked, both methods agree on relative ordering).
- Confirmed `@shopify/react-native-skia` and `@livekit/react-native` (native-only packages) do **not** appear in the web module graph at all — i.e. web-platform exclusion already works correctly for those two; the web-bundle weight problem is concentrated in the candidates listed above, not a blanket "all native deps leak to web" issue.

## Caveats

- `dist-atlas-baseline/` and `.expo/atlas.jsonl` are build artifacts, not committed (gitignored via existing `dist`/`.expo` patterns) — this doc is the durable record. Re-run the reproduction command above to regenerate raw data.
- Per-package sizes are **pre-minification source size** (`module.size` from the Metro graph), not final minified+gzipped bytes per package — directionally correct for prioritization, but the initial-load gzip figure (3.29 MB) is the only number that reflects actual wire weight. Pair both when scoping PR-26 trims.
- This run used `expo export` (production/minified build settings) on web platform only, matching the PR-25 scope (web build per G21/G22).
