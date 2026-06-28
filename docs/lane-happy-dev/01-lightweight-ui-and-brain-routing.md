# Lane happy-dev — Design-converge: lightweight UI + local-brain routing

seat-f0d9f9 · branch `lane/happy-dev` · status: **design, pre-build** (converge → build → witness)

This is the approach to bring to the overseer BEFORE building. Grounded in the
actual tree, not memory. Two birds + the cost badge.

---

## Bird 1 — Lightweight daily-driver UI (the acute RAM OOM)

### Root cause of the OOM (decomposed)
The daily driver today is the happy **web app in a Brave tab**. Brave is a full
Chromium: a process tree (browser + GPU + per-tab renderers + network service)
plus extensions — including the **Claude-in-Chrome MCP**. The happy web build is
itself heavy (React-Native-Web + Skia/WebGL + mermaid + CodeMirror + LiveKit).
The OOM is **two Chromium stacks co-resident**: the happy UI tab *and* the
Chrome-MCP, inside one Brave, on a box Carlos also uses. The dominant cost is
running Brave at all alongside the MCP — not the app's own JS heap.

### Recommended approach: adopt the EXISTING Tauri shell, target Windows/WebView2
The repo **already ships a Tauri desktop variant** (`packages/happy-app/src-tauri/`,
`tauri:*` scripts, `@tauri-apps/*` deps). It loads the Expo **web export**
(`frontendDist: ../dist`, built via `expo export --platform web`). On Windows,
Tauri renders in **WebView2** — the OS-shared Edge runtime.

Why this kills both birds:
- **RAM (bird 1):** WebView2 is a shared system runtime — no second Chromium
  bundled, one webview render path for the app, **no extensions, no other tabs,
  no Brave background services.** Crucially it **decouples the daily UI from
  Brave**, so Brave + Chrome-MCP can be **closed during normal work** and only
  opened for DOM-troubleshooting. Closing the second Chromium stack *is* the OOM
  fix. (App WebView2 window ≈ a few hundred MB; Brave's full tree with
  extensions is routinely 1–3 GB+.)
- **Proper interface (bird 2):** a dedicated, titled, single-purpose desktop
  window — not a heavy browser tab — using the full existing synced/E2E-encrypted
  happy UI. Zero UI rebuild.

**What it replaces:** the Brave tab as daily driver. The chrome-MCP / `--chrome`
path (preserved on `fix/chrome-passthrough`, commit `1870248`) stays as the
troubleshooting/DOM-inspection surface only — complementary, not clobbered.

### Build gaps to close (the actual work, after sign-off)
1. **Windows config.** `tauri.conf.json` today is macOS-only (Developer-ID
   signing, `titleBarStyle: "Overlay"` + `trafficLightPosition` are macOS-isms).
   Add a Windows window config (standard decorations) + Windows bundle target.
   `icons/icon.ico` already exists.
2. **Run the built binary, not the dev server, as the daily driver.**
   `tauri:dev` runs `beforeDevCommand: pnpm start` (Metro/Expo dev server = extra
   Node + bundler RAM). For dogfooding, build once (`expo export web` →
   `tauri build`) and run the **static binary**; reserve `tauri:dev` for UI
   iteration. This is the lighter steady-state.
3. **Point at the self-host server.** Web build must read `HAPPY_SERVER_URL`
   from `.env.selfhost` (gitignored SECRET — never commit). Verify how happy-app
   resolves the server URL on web at build/runtime.
4. **Smoke-verify the web export in WebView2** — Skia-web (`setup-skia-web`) +
   WebGL render correctly; LiveKit/voice can be deferred/lazy.

### Alternatives considered & rejected
- **Trim the RN-Web app** (code-split, drop Skia/mermaid/LiveKit on web): real
  win but high-effort and doesn't touch the Brave-process overhead that is the
  bulk of the OOM. Keep as **phase 2 inside the Tauri shell**, not the fix.
- **Brand-new minimal native client:** throws away the synced/encrypted UI;
  massive rebuild. Rejected.
- Tauri is already a sanctioned, partially-built in-repo path → lowest risk,
  fastest to a daily driver.

### Open forks for the overseer / Carlos
- **Built binary vs `tauri:dev`** as daily driver — I recommend the **built
  binary** for RAM; dev server only when iterating UI.
- **Phase-2 web-app trim** — do it, or is WebView2-vs-Brave enough? (My read:
  ship the shell first, measure, then decide.)

---

## Bird 2 — Local-brain routing seam (CONSUME brain-3090, don't build)

> **CORRECTION (overseer, this round):** brain-3090 = **Ollama**, which speaks the
> **OpenAI** `/v1/chat/completions` API, NOT the Anthropic Messages `/v1/messages`
> API that `ANTHROPIC_BASE_URL` expects. Pointing `ANTHROPIC_BASE_URL` straight
> at Ollama **will not work** (API mismatch). An **adapter shim** is required.

### The seam (exact location) — mechanism unchanged
A turn's brain is selected by the **env handed to the spawned Claude**, in two
places that must stay consistent:
- **SDK/remote path:** `packages/happy-cli/src/claude/sdk/query.ts:62-70` builds
  `env` from `process.env` and assigns `sdkOptions.env`.
- **Local PTY path:** `packages/happy-cli/src/claude/claudeLocal.ts:260-263`
  builds `env = { ...process.env, ...opts.claudeEnvVars }`.

Claude Code honors `ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN` /
`ANTHROPIC_MODEL`. Routing stays **pure env injection — no SDK fork** — but the
base URL points at the **adapter**, not at Ollama directly:

```
spawned Claude  --(Anthropic Messages)-->  ADAPTER SHIM  --(OpenAI /v1)-->  Ollama @ brain-3090
```

### Two pieces
1. **Env injection (my lane, ready to build):**
   - `resolveBrain()` in `configuration.ts` → `{ mode: 'cloud' }` (no overrides)
     or `{ mode: 'local', env: {...} }`. Mirrors the existing
     `HAPPY_*_URL` env > settings > default precedence already in that file.
   - one `applyBrainEnv(env)` helper called in **both** spawn paths → single
     source of brain-truth (same discipline as one-source cost-truth in
     `useSessionCost`).
   - `local` env set:
     - `ANTHROPIC_BASE_URL` → the **adapter** URL (not Ollama)
     - `ANTHROPIC_AUTH_TOKEN` → dummy (adapter holds/ignores auth; local mesh)
     - `ANTHROPIC_MODEL` → ladder-selected, default `qwen3:30b-a3b`
   - Adapter's upstream config (set on the adapter, not in happy):
     Ollama base `http://100.64.0.2:11434/v1` (OpenAI-compat), no auth.
   - **Trigger:** `HAPPY_BRAIN=cloud|local|auto`; auto = cloud-reachable/shed
     probe as a follow-on. **Decide at session/turn start, never mid-turn.**
   - Secrets/local config live in `.env.selfhost`-style files — never committed.
2. **Adapter shim (overseer is scoping):** an Anthropic-Messages → OpenAI/Ollama
   translating proxy. **Adopt, don't build** — LiteLLM proxy, or
   claude-code-router / anthropic-proxy (battle-tested). This is the load-bearing
   piece for the local-model-replaces-workers arc.

**Build order for bird 2:** my env-injection is small and can land behind the
flag immediately once the **adapter URL** is fixed by the overseer's shim scope.
Until then, the seam is designed but the target URL is a TBD held by the adapter.

---

## Bird 3 — B1 cost badge
`sources/hooks/useSessionCost.ts` is the witnessed-GREEN hook (reuses
`getUsageForPeriod`→`calculateTotals`, the same priced path as the Usage panel —
cost agrees by construction). **Wire it into the new Tauri daily surface's
session chrome** (header/status area). Trivial; rides on bird 1 — defer wiring
until the surface is the daily driver.

---

## Sequencing
1. **Bird 1 first** (acute OOM) — Windows Tauri shell on the self-host server.
2. **Bird 2** — land the routing-seam design now; build once brain-3090's API
   contract is confirmed.
3. **Bird 3** — wire the cost badge onto the bird-1 surface.

Discipline: commit on `lane/happy-dev`, **no push** (Carlos gates).
`.env.selfhost` is a secret, never committed.

---

## Bird-1 Windows-Tauri build plan (sprint-ready — execute on Carlos's greenlight)

APPROVED: built-binary daily driver, WebView2, self-host server. Below is the
exact sequence so the build is a sprint, not a discovery exercise.

### How the web build picks the server (traced, load-bearing)
`getServerUrl()` (`sources/sync/serverConfig.ts:10`) precedence:
1. MMKV `custom-server-url` — set at runtime via in-app server settings
   (`setServerUrl`); persists across logouts.
2. `globalThis.__HAPPY_CONFIG__?.serverUrl`
3. **`process.env.EXPO_PUBLIC_HAPPY_SERVER_URL`** — baked in at `expo export`.
4. default `https://api.cluster-fluster.com`.

→ **Bake the self-host URL via `EXPO_PUBLIC_HAPPY_SERVER_URL` at export time**
(read from `.env.selfhost`, never committed). The in-app server-settings override
(MMKV) is the runtime fallback. The URL is inlined into `dist/` JS — fine for a
local binary; the SECRET in `.env.selfhost` (token) still never gets committed.

### Step sequence
1. **Branch hygiene:** work on `lane/happy-dev`, commit-in-place, no push.
2. **Windows window config** — `tauri.conf.json` `app.windows[0]` is macOS-only
   today (`titleBarStyle: "Overlay"`, `trafficLightPosition`, `hiddenTitle`).
   Add a Windows-valid window block (standard `decorations: true`, drop the
   macOS traffic-light keys for win32). Likely a `tauri.windows.conf.json` or
   conditional config so macOS config is untouched.
3. **Windows bundle target** — add `"nsis"` (and/or `"msi"`) to `bundle.targets`
   for win32; `icons/icon.ico` already present. WebView2: rely on the evergreen
   runtime already on Win11 (no bundled Chromium — the RAM win); set
   `bundle.windows.webviewInstallMode` to `skip`/`downloadBootstrapper`.
4. **Export the web frontend** — `EXPO_PUBLIC_HAPPY_SERVER_URL=<selfhost> \
   pnpm exec expo export --platform web --output-dir dist` (matches
   `beforeBuildCommand`). Confirm `dist/` produced.
5. **Build the binary** — `pnpm tauri:build:dev` (uses `tauri.dev.conf.json`).
   Produces the standalone Happy (dev) .exe/installer.
6. **WebView2 smoke checklist** (the risk surface):
   - **FIRST — smoke Skia-web** (`setup-skia-web`, runs in `postinstall`):
     charts/avatars draw, no WebGL/CanvasKit errors in WebView2 devtools.
     This is the HIGHEST-uncertainty item — surface a render-fail BEFORE sinking
     time in bundle config (overseer directive).
   - app boots, QR/auth screen renders;
   - sync connects to the self-host server (`getServerUrl()` resolves to it);
   - **ACCEPTANCE GATE — measure RAM** of the WebView2 process tree vs the
     Brave-tab+MCP baseline. **The OOM fix is NOT proven until the RAM-delta
     shows it** (overseer: this measurement is the acceptance gate, not just a
     metric). Bring the delta back as witness evidence.
   - LiveKit/voice may be lazy/deferred — not a blocker for the daily driver.
7. **Bird-3 hook** — once the surface is up, wire `useSessionCost` into the
   session chrome (header/status). Small follow-on commit.

### Known risks / watch-items
- macOS-ism keys in the window config will reject on win32 — must be split.
- Skia-web in WebView2 is the highest-uncertainty item → smoke-test early.
- `expo-http-server` / native-only modules: web export already excludes native;
  verify no web-build break from RN-only deps.
- If WebView2 evergreen runtime is somehow absent, `downloadBootstrapper` mode
  covers it (still no bundled Chromium).

### Witness evidence to bring back
- The built binary runs as a standalone window on the self-host server.
- **RAM delta**: WebView2 happy window vs Brave-tab+MCP baseline (the OOM proof).
- Brave can be fully closed during normal work; Chrome-MCP only for DOM debug.

Status: **plan complete, NOT building.** Awaiting Carlos greenlight (overseer
surfacing the gate). Adapter URL for bird-2 still TBD from overseer's shim scope.
