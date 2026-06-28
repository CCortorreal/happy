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

### The seam (exact location)
A turn's brain is selected by the **env handed to the spawned Claude**, in two
places that must stay consistent:
- **SDK/remote path:** `packages/happy-cli/src/claude/sdk/query.ts:62-70` builds
  `env` from `process.env` and assigns `sdkOptions.env`.
- **Local PTY path:** `packages/happy-cli/src/claude/claudeLocal.ts:260-263`
  builds `env = { ...process.env, ...opts.claudeEnvVars }`.

Claude Code already honors `ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN` /
`ANTHROPIC_MODEL`. So routing to the local brain is **pure env injection — no SDK
fork.** Point those at brain-3090's endpoint and the same code path talks to the
GPU instead of the cloud.

### Design shape
- Add `resolveBrain()` in `configuration.ts` returning either
  `{ mode: 'cloud' }` (no overrides) or
  `{ mode: 'local', env: { ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN, ANTHROPIC_MODEL, … } }`.
  Mirrors the existing `HAPPY_*_URL` env > settings > default precedence already
  in `configuration.ts`.
- Add one `applyBrainEnv(env)` helper called in **both** spawn paths → single
  source of brain-truth (same discipline as the one-source cost-truth in
  `useSessionCost`).
- **Trigger:** start with an explicit `HAPPY_BRAIN=cloud|local|auto` flag;
  add an auto health-probe (cloud reachable / shed signal) as a follow-on.
  **Decide at session/turn start, never silently mid-turn** (avoids a half-cloud
  half-local turn).
- Secrets (local base URL + token) live in `.env.selfhost`-style config — never
  committed.

### Open question for the overseer (blocks build of (b))
Does **brain-3090 already speak the Anthropic Messages API** (so
`ANTHROPIC_BASE_URL` "just works"), or is an adapter shim needed? This is the
only fork between "(b) = env injection only" and "(b) = env injection + small
proxy." The brain is built — I need its **base URL + auth + model id** to wire
the consume side.

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
