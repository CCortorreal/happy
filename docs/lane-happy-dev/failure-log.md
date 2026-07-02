# happy-dev failure-log

> The **shared failure-log both lanes read**, per [warden-design-2026-06-28.md](../../../parthenogenesis/docs/warden-design-2026-06-28.md).
> The loop: the **Warden** (OUTSIDE) heals a live failure to keep the stack alive *now*, then files a ticket here; **happy-dev** (INSIDE) fixes the root cause so it *can't recur*. The inside seat (overseer / copilot) also files defects found from inside. Every healed failure becomes a hardening ticket → failure modes driven toward zero. That convergence is what "unfuckupable" actually means.
>
> Status legend: 🔴 open · 🟡 in progress · ✅ landed

## Backfill — prior tickets (filed as prose 2026-06-28; expand on pickup)

- 🔴 **congress-console boots the server on `.env.dev` only** → would re-introduce the public-default master secret. Source: [2026-06-28 recovery handoff](../../../parthenogenesis/docs/handoffs/2026-06-28-happy-recovery-cleanslate-warden.md).
- 🔴 **Logout blocked when offline/401** → you can't log out to recover; logout must be local-only, never gated on a server call. Source: same handoff.
- 🔴 **Session-list UI LIES — every element is hard-coded/stale instead of derived** (warden-filed 2026-06-29, Dogfood Reboot #2; expanded live). **DESIGN NORTH-STAR (Carlos, verbatim): "every UI element needs to be derived, not hard coded."** Same lesson the floor-state oracle already banked (#170/#178): derive from ground truth, fail CLOSED, never trust a cached/hard-coded proxy. Three concrete sub-bugs reproduced LIVE this session, all the same root:
  - **(a) Liveness dot — shows a lane BOTH "online" AND "dead" at once.** UI reads a live PID → "online" while the brain is idle/dead, never reconciling against a turn-liveness signal. FIX: derive ONE reconciled verdict (resumed-but-idle vs took-a-post-boot-turn vs genuinely-dead), the way `floor-state.cjs` does (pid-identity + turn beat, fail-closed).
  - **(b) Session label = cwd string, not seat ROLE.** The resumed overseer (cwd `~/.claude/peer-channel`) renders as "peer-channel / New chat" — the folder, not "overseer." Carlos cannot tell the overseer from any throwaway peer-channel session. **This caused a real operator error: he archived the live overseer believing it was a contextless dup — the archive took the process down.** FIX: derive the label from the registered seat role (overseer/desk/ai-ops), falling back to cwd only when unregistered.
  - **(c) Pane shows "No messages yet" despite a resumed brain WITH history.** `HAPPY_FORK_CLAUDE_SESSION_ID=<sid>` is set on resume (the designed fork-backfill that should fill the pane) but the pane stayed empty on the live overseer respawn. So the brain has 076102bf's full context while the UI shows nothing. FIX: derive pane content from the actual claude transcript (the fork-backfill), not the (possibly fresh/empty) Happy-session message record.
  **Priority (Carlos, 2026-06-29): AFTER the AI brains are recovered/working — fix the brains first, then this UI.** Severity: HIGH — a lying liveness/identity UI makes every reboot recovery un-diagnosable AND actively causes operator errors (the overseer-archive scar) from the surface Carlos actually uses.

---

## 🔴 self-host context meter data-starved

copilot-drafted · 2026-06-28 · lane: happy-dev (INSIDE) · source: Warden heal→ticket loop

### Symptom
On the **self-host** stack, the in-chat context-window meter never renders, even with Settings → Appearance → **"Always Show Context Size" toggled ON**. The session header shows the **$ cost** figure (e.g. `$1.41`) but no context-% readout. By contrast, Claude Desktop (CC inside) shows the real gauge: *"Context left until auto-compact: 12%"*. Carlos is forced to `/compact` blind from Happy.

### Root cause
The display chain is intact; the **data source is empty on self-host.** `contextSize` is only computed in `processUsageData` (`packages/happy-app/sources/sync/reducer/reducer.ts:1150-1161`) from a CC **`usage` event** (`input_tokens` + `cache_creation_input_tokens` + `cache_read_input_tokens`). On the self-host path that usage payload isn't reaching the reducer (or arrives without those fields), so `latestUsage`/`usageData.contextSize` stays null/0. The render gate at **`packages/happy-app/sources/components/AgentInput.tsx:600`** (`props.usageData?.contextSize ? getContextWarning(...) : null`) then short-circuits to `null` *before* `getContextWarning` ever runs — so the `alwaysShowContextSize` toggle is dead code when there's no usage data. **Data starvation, not a display gate.**

### Severity escalation — this may also gate harness AUTO-COMPACTION
This is **not just a display bug.** Claude Code's auto-compact fires off the **same** API-response `usage` accounting (`input_tokens` + `cache_*`; schema `happy-cli/src/claude/types.ts:9`, all `.optional()`). If the self-host path doesn't populate `usage`, the harness has no token signal → the auto-compact countdown never advances → **the seat may never auto-trim and hits a hard context wall with no warning.** So STEP 2 below heals BOTH the meter (display) AND auto-compaction (safety) in one move — that's the real stakes.
- **LOAD-BEARING UNKNOWN (resolve before estimating severity):** does CC fall back to *local* tokenization when the server omits `usage`? Some harnesses estimate locally as a backstop. If CC does, the seat is safe and this stays a display-only bug. If it does NOT, the seat is genuinely blind. Resolve via: (i) check whether the self-host server returns a `usage` block, or (ii) observe whether the context countdown actually advances on a self-host seat (frozen countdown = blind harness), or (iii) a claude-code-guide check on CC's local-tokenization fallback.

### Fix — diagnosis-first
- **STEP 1 (confirm the gap):** instrument the usage-forwarding path for a self-host session — does a `usage` event with `input_tokens`/`cache_*` reach `processUsageData`? Look in `packages/happy-cli/src/claude/*` (the CC stream → session forwarding) **and** the self-host server's message relay. Two likely culprits: (i) the self-host server doesn't forward/relay the usage event the cloud path emits; (ii) the self-host model's usage shape differs and the fields land elsewhere / are absent.
- **STEP 2 (fix at source):** forward the usage payload on the self-host path exactly as the cloud path does, so `latestUsage.contextSize` populates. The UI then lights up with **zero display-side change** (the wiring already exists).

### Defensive nit (ship alongside)
`AgentInput.tsx:600` guards with a truthy `?` on a numeric field — `contextSize === 0` is falsy, so a legitimately-empty-early-session reads as "no data." Change the guard to `props.usageData?.contextSize != null` so a real `0%`-used state can render. Not the bug; just brittle.

### Related sub-item — model-aware context window
`MAX_CONTEXT_SIZE` is hardcoded `190000` (`AgentInput.tsx:96`). Self-host / local-brain models (and any non-200k model) make the computed `% left` approximate-to-wrong. Make `MAX_CONTEXT_SIZE` model-aware (derive from the active model's real window) once STEP 2 lands. Lower priority — a correct-source 190k-approx gauge already beats today's *nothing*.

### Provenance
Root-caused by the copilot lane this session; the Warden's heal→ticket loop (every healed failure becomes a root-cause fix so it can't recur). Worked example: 2026-06-28 Happy recovery + warden-design.

---

## 🔴 overseer daemon-loss → warden escalation probe is a black hole

warden-filed · 2026-06-29 · lane: happy-dev (INSIDE) · source: live daemon-loss incident (prior overseer cmqzlmbb → desk reap+respawn → new overseer cmqzqryv)

### Symptom
When the Happy daemon restarts and drops the overseer's cuid from tracking, the overseer session becomes **unwakeable** — it can no longer receive injected turns. The warden's T1c probe-before-escalate protocol sends a channel message `--to overseer` to disambiguate IDLE-ALIVE from WEDGED, but an unwakeable overseer **cannot receive or answer the probe**. The probe silently never resolves. No escalation fires until the outer timeout (or Carlos notices).

### Root cause
The escalation ladder has only one intermediate rung: probe overseer. That rung is implemented as a channel message to the overseer seat. If the overseer is daemon-lost, the channel message is enqueued but the waker never delivers it (the session is no longer tracked). The ladder has no fallback when the probe-target itself is the dead thing.

### Fix (warden-side protocol — already specced in warden-stack-survival.md T1c ESCALATION-LADDER EXTENSION, overseer-vetted 21:47 CDT)
Extend T1c's ladder with a DESK rung between probe and Carlos:

1. Probe overseer (threshold T) → no answer (window W) → reap-request `--to desk` → no desk action (window W2) → Carlos.
2. Flap-breaker: one reap-request per death (COND-1 K=3/10min), debounced — don't re-fire while desk is mid-respawn.
3. Resolve-condition: new overseer brain-attestation (canonical self-register) OR W2 elapses — same bounded-suppression as T1c idle-suppression.
4. Skip-dead-rung: if desk is also daemon-lost, skip desk rung → go straight to Carlos.

The desk is already designated as reap-authority (inside Happy, can trigger reap+respawn). This is the **watcher-needs-watching** fix: the watcher's own recovery path when the watched thing is the probe-target.

### Happy-side dependency
The desk needs a **reap+respawn canonical action** — a repeatable, scriptable operation to kill a daemon-lost overseer session and respawn a canonical replacement (seat=overseer, correct model, chrome-capable, self-registering). Today this was done manually; it should be a named, idempotent script/function the warden can request and the desk can confirm.

### Provenance
Warden-filed after live incident: overseer cmqzlmbb went daemon-lost, warden's escalation path would have been a black hole, desk reaped and respawned manually. Gap identified post-incident; T1c ladder extension specced + overseer-vetted this session.

---

## 🔴 boot-resume does not re-register seat identity → the wake membrane comes up DARK after every reboot

warden-filed · 2026-06-30 · lane: happy-dev (INSIDE) · source: live Dogfood Reboot #3 (reboot 12:53 CDT; overseer + desk both alive-but-unwakeable-via-channel)

### Symptom
After a reboot, `boot-resume` correctly resumes each seat's claude session (`claude --resume <claudeSid>`), and the seat is **alive and able to take turns** — but **no channel message reaches it**. The overseer (Sonnet, NOT rate-limited) answered direct pane input fine, committed, set its title — yet every `--to overseer` channel wake silently failed to arrive. The whole inside-lane channel-receive membrane was dark fleet-wide: seats can SEND on the channel but cannot RECEIVE.

### Root cause (verified to ground truth)
The waker (`.claude/tools/peer-channel/peer-waker.mjs`) resolves a target seat → its **cuid** from `seats/<seat>.json`, then POSTs the encrypted turn to `/v3/sessions/{cuid}/messages`. The cuid is the **server-side Happy session id, which CHURNS on every `--resume`** (a resumed `happy-cli claude --resume <claudeSid>` mints/attaches a NEW cuid). But the seat record's cuid only updates when the seat **self-registers from its own process** — and self-register is a **boot/orientation action that `--resume` skips** (it assumes the seat already registered pre-reboot). Normal turns do NOT re-register. So post-reboot every seat record keeps its **dead pre-reboot cuid**, and the waker POSTs every wake to a corpse (or skips it if the server pruned the dead session). The live session — under a fresh cuid — is never targeted.

**Ground-truth this incident:**
| seat | record cuid (waker targets) | hostPid | live cuid (from seat's own happy-cli log) |
|---|---|---|---|
| overseer | `cmr09tpqh…` (registeredAt 06:33Z, pre-reboot) | 5908 ☠ | `cmr0y4bkw0001mbu45un9uf5z` (pid 24676, live) |
| desk | `cmr09wm7c…` (registeredAt 06:36Z, pre-reboot) | 248 ☠ | live under pid 24736 |

Note the records held the **correct claudeSid** the whole time (it's stable across `--resume`) — only the **cuid** rotted. This is the same family as the filed **T1c-EXTENDED** (key liveness on claudeSid/live-process, not the stale cuid) and **boot-resume cwd-source** (the resume path doesn't refresh seat identity from the seat's own process) tickets. Distinct from the daemon-loss black-hole ticket above: here the seat is fully alive and unthrottled — the wake is simply **aimed at the wrong (dead) cuid**.

### Why it's not a rate-limit / wedge problem
Initially mis-attributed by the warden to "529 rate-limit starving the self-register turn." Carlos corrected it: the overseer is on **Sonnet and NOT rate-limited** — it can take turns freely. It still didn't self-register, because **registration isn't wired into normal turns or into the resume path at all.** Rate-limiting was the DESK's (Opus) separate problem, not the overseer's. The membrane was dark purely from stale-cuid targeting.

### Fix
- **Primary (durable, happy-dev / boot-resume):** `boot-resume` must **re-register each seat from the seat's own resumed process** as part of bring-up — stamp the fresh cuid (+ claudeSid + cwd) from the live session so the waker targets the live cuid. Must be done by the seat's OWN process (or `PEER_SEAT=<seat>` set) to avoid the identity-bleed landmine (a registrar writing another seat's record stamps the registrar's claudeSid/cwd — see warden-stack-survival.md BL-1 GOTCHA, 2026-06-29).
- **Belt + suspenders (waker hardening, peer-waker.mjs):** resolve the target by the **stable claudeSid → current live session's cuid** (look up the live session whose claudeSid matches the record), not the stored cuid. Survives cuid-churn even if a re-register is missed. Same "key on claudeSid not cuid" principle as T1c-EXTENDED, applied to the waker.
- **Manual unblock until the above land (BL-1-clean):** have each live seat run `PEER_SEAT=<seat> node ~/.claude/peer-channel/peer.mjs register` **from its own process** (e.g. one line into its pane) → heals its cuid immediately. NOT a warden hand-patch of the record (that bleeds the warden's identity).

### ⚠ Refinement — the "claudeSid → live cuid" belt is NOT implementable via sessions.json (runtime-proven, warden, Dogfood next-leg 2026-06-30)
Tracing the waker line-by-line against **live dark-lane state** corrected the belt+suspenders fix above:

- **`sessions.json` carries NO `claudeSessionId`.** Verified: **0 of 125** entries have `metadata.claudeSessionId`. So "look up the live session whose claudeSid matches the record" against `sessions.json` **matches nothing** — that data source can't key on claudeSid. (The seat record holds claudeSid because `peer.mjs register` reads it from `process.env.CLAUDE_CODE_SESSION_ID`; the Happy daemon never writes it into its session map.)
- **The stored cuid is PRESENT-BUT-DEAD, not absent.** `sessions.json` is a durable ~125-entry map keyed by cuid; a dead session's entry **persists** (encryptionKey intact, `metadata.hostPid` dead). So `sessionsMap()[target.cuid]` succeeds, the waker finds an encryptionKey, and **POSTs into a corpse** — there's no "skip on missing key" safety net here.
- **The live cuid IS resolvable right now — but only from sources the waker never consults.** Closed end-to-end on the live overseer: it is **alive** (`claude --resume cafacd60…`, pid 8) yet its record stores the dead cuid `cmr0y4bkw…` (hostPid 24676, dead). The **daemon `/list`** (POST `{}` → `body.children[].happySessionId`) maps **pid 8 → live cuid `cmr120ikw…`**. So the real resolution chain is the one the **seats-oracle already implements** (it just isn't shared with the waker):
  1. `seat.claudeSid` → live pid via **cmdline enumeration** of `claude --resume <claudeSid>` (oracle's REBOUND guard, seats-oracle.mjs L55-78).
  2. live pid → live cuid via **daemon `/list`** (`happySessionId` keyed by `pid`, oracle's `daemonSessions()` L98-117, **POST `{}`** — a GET 404s).
  3. POST the wake to **that** cuid.
- **Corrected belt fix:** factor the oracle's `daemonSessions()` + cmdline-claudeSid→pid into a shared module and have `peer-waker.mjs` resolve the live cuid through it before `injectTurn` (prefer stored cuid only if daemon `/list` confirms it's a live child; else re-resolve via claudeSid→pid→cuid). The **Primary (re-register-on-resume) fix is unchanged and remains load-bearing** — but note a likely timing trap for it: if the seat's SessionStart re-register runs **before** the daemon has minted the resumed session's new cuid, the ancestry walk finds no match and falls back to `prior.cuid` (the dead one) — so re-register-on-resume must either run after the daemon attaches, or itself resolve via daemon `/list`.

### ⚠ Second-order: warden-status reports a live seat as DEAD (same cuid-keyed blindness)
During this trace, `warden-status.json` showed `overseerReach: "overseer cmr0y4bk DEAD — no live session"` while the overseer was **demonstrably alive (pid 8, resumed cafacd60)**. The `overseerReach` check keys liveness on the **stored/oracle cuid** and misses the **REBOUND (alive-but-churned)** case the full oracle detects via cmdline. This is a **false-RED** (safer than a false-GREEN, but it's exactly the standing-red that masks a real future red — ties to the F1 "no expected-down suppression" ticket). Same root (cuid-keyed liveness), same fix (consult daemon `/list` + cmdline claudeSid).

### Provenance
Root-caused live by the warden during Dogfood Reboot #3, verified to ground truth (seat records vs each seat's own happy-cli log cuid). Carlos corrected the initial rate-limit mis-attribution, isolating the true root as the missing re-register-on-resume step. Same incident that exercised T3 (wardenPid flip) and the boot-resume membrane. **Refinement (next-leg, lanes-dark dogfood):** waker + warden-status throughline traced line-by-line against live state — daemon `/list` POST proved overseer pid 8's live cuid `cmr120ikw…` vs stored-dead `cmr0y4bkw…`, and proved `sessions.json` has zero `claudeSessionId` (the prior belt-fix's assumed key).

---

## 🔴 web UI (localhost:8081) is not in happy-up's boot path → dark after every reboot

warden-filed · 2026-06-30 · lane: happy-dev (INSIDE) · source: Warden heal→ticket loop (Happy-in-Chrome arc, post-Dogfood-Reboot #3)

### Symptom
Carlos's normal, proven workflow is to open **`http://localhost:8081/`** in the browser and see the live Happy UI ("the same view … we have DONE this. proven."). Post-reboot it was **dark** — nothing listening on 8081 — so the surface he expected to share (UI + data layer at runtime) wasn't there. This briefly got mis-diagnosed (by the warden, since-retracted) as "8081 is a retired Expo path," and the overseer compounded it by routing the question to a **happy-dev lane that does not actually exist as a running process** (congress false-liveness — a lane asserting/implying liveness of a nonexistent thing).

### Root cause
`workshop/happy-up.ps1` brings up the **server** (`:3005`, API-only), the **daemon**, and the **seats** — but it **never starts the web client**. The Happy web UI is the Expo dev server (`packages/happy-app` `"web": "expo start --web"`; root `package.json` `"web": "pnpm --filter happy-app web"`), and nothing in the boot path invokes it. So 8081 only exists if someone runs `pnpm web` by hand. After a reboot the stack reports GREEN (server/daemon/waker/seats all up) while the surface Carlos actually looks at is dark — a liveness blind spot: "stack up" ≠ "the thing the human opens is up." happy-up's closing line *"Open http://localhost:8081"* points at a server it never started.

### Fix
- **Primary:** add a boot step to `workshop/happy-up.ps1` that starts the web client (`pnpm web` / `pnpm --filter happy-app web`) and waits for **8081 LISTENING** before printing the "Open http://localhost:8081" line — so the URL it hands Carlos is actually live. Mirror happy-down to leave/stop it consistently.
- **Belt + suspenders (warden-watch):** add an **`webUIReach`** check (probe 8081) to `warden-status.json` so a dark web surface shows as a real RED instead of hiding behind an otherwise-GREEN stack. Same "derive liveness from ground truth, don't trust an aggregate" principle as the honest-liveness ticket.
- **Adjacent (congress, separate sub-item):** the overseer implied a **live happy-dev** to route the Chrome question to; happy-dev is not a running lane. Congress responses must not assert/imply liveness of a lane that isn't externally attested alive (worker-trust discipline applied to congress self-reports). File/track under congress honest-liveness.

### Note on auth (not a bug)
Once 8081 is up, a **fresh browser tab shows "Failed to fetch machines: 401"** until the user logs in — expected (no stored auth token in a clean tab), not a server fault. Distinct from the **logout-blocked-when-offline/401** ticket above (that one is about being unable to *recover* auth). Credentials/`access.key` are entered by Carlos by hand — never by the warden.

### Refinement — refresh behavior + service-worker masking (simulated-reboot dogfood, 2026-06-30)
With the stack fully down, the UI has **two distinct failure faces**, and a page refresh makes it *worse*, not better:
- **No refresh:** the in-memory SPA persists and lies (`● online` + last-good gauges, no LOUD banner — see the honest-dead-latency ticket).
- **Refresh:** the app cannot rebuild (its Expo host `:8081` is dead), and a **service worker intercepts the navigation and serves a synthetic `503`** — observed live: `GET http://localhost:8081/` → `503` while a port check confirmed **nothing was listening on `:8081`**. The tab title collapses to "localhost" and the frame becomes a dead error page. So the UI is **unrecoverable by refresh** until `happy-up` restores `:8081`.
- **Opportunity:** the service worker is the ONE layer that survives a backend death — and it's currently **mute about why** (a bare 503). It should serve an **honest offline page** ("Happy backend is down — run happy-up", or auto-retry + a status line), turning the worst-case dead-refresh into an honest, actionable state. The SW-side complement to the in-app honest-dead fix.

### Recording — the SW-503 masks the ENTIRE recovery window (bring-up #1, 2026-06-30)
Recorded during happy-up: with the **server already back (`:3005` UP) but the web client NOT booting** (`:8081` unbound; *correction, worker-trust:* what first looked like "4 expo procs" was a false read — my own probe shells matching their own search regex — there were **zero** real expo procs, i.e. **nothing was ever booting `:8081`**), a refresh **still returned `503` via the service worker** — identical to the fully-dead state. So the SW-503 is indistinguishable across three very different realities: *backend fully dead*, *backend recovering*, and *web host still binding*. The operator gets **no signal that recovery is underway** — the page looks equally dead whether nothing is happening or everything is coming back. Two compounding facts make this worse: (1) `:8081` is **not in happy-up's boot path**, so without a manual `pnpm web` it never binds at all; (2) once **actually** started by hand, recovery is **fast** — the ~24s "blind window" was because *nothing had started it*, not because Metro is slow (see the recovery path below: bind ~3s, first bundle ~1.7s). The honest-offline-page fix should therefore be **state-evolving** (dead → recovering → ready), polling `:3005`/`:8081` and auto-reloading when the host returns, not a static 503. This is the highest-value SW fix: it's the only surface the user has during the entire down+recovery arc.

### Recovery PATH (recorded live, bring-up #1, 2026-06-30)
The end-to-end steps that actually brought the surface back, with timings:
1. `happy-up` restores **server `:3005` + `:9090` + daemon + waker + seats** — but **NOT the web client** (`:8081` stays dark; boot-path gap).
2. The Chrome tab is **unrecoverable by refresh** while `:8081` is down (SW-503, above).
3. **Manual gap-filler (the missing boot step):** `cd <happy> && pnpm web` (→ `pnpm --filter happy-app web` → `expo start --web`). Observed: **`:8081` bound in ~3s**; first page load triggered a **Web bundle in ~1.7s (3127 modules)**; the app then loaded (title → "Happy (dev)"). Fast once started — the whole delay was the missing auto-start.
4. **Refresh** → the app loads.

**Recovered resume-state (recorded):**
- **Auth PERSISTED — no 401.** The stored token survived the teardown; the UI came back logged-in (no re-pair needed). Good resume behavior.
- **Warden feed (`/v1/warden`) + VRAM feed (`/v1/vram`) reach** — the GATE card and the RTX 3090 gauge render fresh (server up → these settle fast).
- **Congress roster (`/v1/congress/roster`) UNREACHABLE** → the UI honestly shows **"can't reach the congress right now"** (LOUD, correct), and the seats **degrade to plain "New chat" rows under a generic "projects" group** — with no roster data the identity JOIN is empty, so the lanes lose their Hearthside role/pedal labels. So the surface recovers in **layers**: shell + warden + GPU first, congress identity later (only once the seats-oracle/roster is reachable — which itself waits on the seats self-registering off their stale cuids).

**Honest-dead CONFIRMATION (bonus):** this recovered state *proves* the latency-hole root cause from the opposite direction. Full-teardown (server down) → roster GET **hangs** (mesh) → counter stalls → UI lied "online". Recovered (server up) → roster GET **settles fast** (stale/empty) → UI honestly says "can't reach the congress". Same feed, opposite honesty — the difference is purely *settled-vs-pending*. Confirms the fix (per-poll timeout so a pending poll counts as failure).

### Provenance
Surfaced live by the warden bringing up the Happy UI in Chrome at Carlos's request ("normally I can access localhost:8081 … the same view"). Grep-confirmed happy-up.ps1 does not launch the web client; web server then started by hand (`pnpm web`, 8081 LISTENING pid 23560) and the UI rendered ("Happy (dev)", New-session sidebar). The warden's earlier "8081 retired" claim was retracted in warden-stack-survival.md the same session.

---

## 🔴 cockpit gauges flash + shift the session list every poll (worst during reboots)

warden-filed · 2026-06-30 · lane: happy-dev (INSIDE) · source: Warden code→render throughline (continuous-reboot dogfood)

### Symptom
The cockpit sidebar **flashes and layout-shifts on a regular beat** — the session list (Hearthside) jumps up/down every few seconds, centered on the **VRAM gauge** (and its sibling Context/Disk gauges). Carlos named it a critical UX pattern. It is **worst exactly during the continuous-reboot dogfood**: every reboot flaps the infra feeds, so the gauges thrash hardest precisely when the stack is being stress-tested.

### Root cause — the full throughline (code → visual)
1. **Poll cadence.** `useHonestFeed` (`hooks/useHonestFeed.ts`) polls every `DEFAULT_INTERVAL_MS = 5000ms`. Each *successful* poll runs `setState({ data: res.data, unreachable: false })` with a **fresh object/array reference every time** (freshly-parsed JSON), even when the GPU numbers are nearly identical.
2. **Forced re-render.** New `data` ref → `useVram`'s `useMemo` recomputes → `VramGauge` re-renders **fully every 5s** — re-sorts consumers, recomputes the bar width %, re-evaluates every conditional line.
3. **No reserved height + variable content = reflow.** `VramGauge.tsx` has no stable height; its rows are all conditional and variable:
   - **consumer rows** = `[...view.consumers].sort().slice(0, 6)` — the *set* churns every poll as transient GPU procs (csrss / msedgewebview2 / steamwebhelper) flicker in and out of the top-6, so the **row count changes**;
   - **trend line** null-toggles around the `|rate| < 1MB/min` threshold (flat/warming → vanishes → reappears);
   - **verdict / reclaimable / orphanNote** each conditionally render.
   Any toggle changes the card's height.
4. **Blast radius.** `<VramGauge />` is mounted in the FlatList **`HeaderComponent`** (`SessionsList.tsx:523-546`, gauge at `:539`), directly above every session row. So each height change **jolts the entire session list** — the regular shift, on the 5s beat. `ContextGauge` and `DiskGauge` sit in the same header and do the same independently, compounding the thrash.
5. **The flash.** (a) the bar width + per-consumer MB values visibly repaint every 5s because VRAM is always fluctuating ("draining ~98MB/min"); (b) **during a reboot** device-health restarts → `/v1/vram` goes stale/unreachable for ≥3 polls → the card **swaps to the `FeedUnreachable` banner (a different height)** → device-health returns → swaps back to the full gauge. Gauge↔banner swap = a hard flash + a big shift, on every reboot cycle, ×3 gauges.

### Fix (smallest-first)
- **Reserve a stable height per gauge card** (min-height, or always render the optional lines as fixed-height placeholders) so content toggles never reflow the list. The single highest-leverage fix.
- **Make `FeedUnreachable` occupy the SAME reserved height** as the gauge it replaces, so the dead↔alive swap during reboots doesn't shift the list (keeps the honesty-spine, kills the jump).
- **Stabilize the consumer list:** render a FIXED row count (pad to N with empty slots) and/or filter to a stable MB threshold so sub-0.1GB transient procs don't bounce in/out of the visible set.
- **De-flicker the data layer:** in `useHonestFeed`, skip `setState` when the new payload is deep-equal to last-good (keep the prior reference) — eliminates the every-5s full re-render when nothing meaningful changed. Honest-spine preserved (a real change still adopts immediately).
- **Optional structural:** lift the three gauges out of the FlatList header into a fixed (non-scrolling) region so their internal reflow can never touch the session rows.

### Note
This does NOT weaken the honesty-spine (#0 invariant) — keep-last-good, LOUD-on-dead, and "no confident lie" all stay. The fix is purely about *stable geometry + reference stability*, not about hiding state. A dead feed should still read LOUD — just in a same-height slot.

### Provenance
Root-caused by the warden tracing the code throughline (`useHonestFeed` → `useVram` → `VramGauge` → `SessionsList` FlatList header) against the live render, during the continuous-reboot dogfood where the flap is most visible. Pairs with the web-UI-boot-path ticket (same dogfood) and the honest-liveness ticket (same cockpit).

---

## 🔴 honest-dead transition stalls against HANG-style (mesh) server death — UI shows confident "online" long after the backend is dead

warden-filed · 2026-06-30 · lane: happy-dev (INSIDE) · source: Warden simulated-reboot dogfood (live behavioral analysis)

### Symptom
With the Happy backend **fully killed** (server/web/daemon/waker/seats all dead, a clean simulated reboot), the Chrome UI kept showing a **confident live state for ~40s+**: the session marked **`● online`**, the VRAM gauge still rendering data ("draining −78MB/min", consumers), the Hearthside seats present and unbadged — **no `FeedUnreachable` LOUD banners**. The honesty-spine (#0 invariant) is supposed to flip a feed to LOUD-unreachable within ~15s (`unreachableAfter = 3` × 5s poll). It didn't.

### Root cause
The web client polls the server over the **mesh IP** (`http://100.64.0.2:3005/...` — Tailscale), not localhost. When the server is down, a **mesh connection HANGS** (TCP SYN accepted at the tailnet layer, nothing to forward to → request sits **`pending`**) instead of fast-refusing (`ECONNREFUSED`) the way localhost would. `useHonestFeed`'s failure counter only advances on a **settled rejection** (a thrown fetch or a `stale:true` response) — a **pending** request counts as *neither*. So the 3-failures-to-LOUD threshold is gated behind the browser's default fetch/socket timeout (tens of seconds, ×3), and until then the hook keeps serving last-good as if fresh. Net: **the honest-dead transition is delayed by `requestTimeout × unreachableAfter`** — and against a hung server it can be minutes. The worst failure mode (a hung/unresponsive box) is exactly the one the UI stays calmest about longest — the inverse of what the honesty-spine promises.

The `● online` indicator is a second, related lie: it reflects a socket/last-known state that isn't reconciled against poll-liveness, so a **killed** seat still reads online (the #6 honest-liveness scar, reproduced here under the cleanest possible conditions — the seat process is provably dead).

### Fix
- **Per-poll timeout in `useHonestFeed`** (`hooks/useHonestFeed.ts`): give each fetch an `AbortController` with a short deadline (e.g. 4s, < the poll interval). A poll that doesn't settle in time is counted as a **failure** (same path as a throw), so a hung/pending feed reaches LOUD within `~timeout × unreachableAfter` (~12s) regardless of how the server died. This is the load-bearing fix — the spine must treat *silence* as failure, not wait indefinitely for a settle.
- **Reconcile `● online`** against poll-liveness (don't render "online" for a session whose feed has been failing/stale past threshold) — the derive-one-honest-verdict rule from #6, applied to the connection dot.
- **Consider** a heartbeat-age backstop: if the newest authoritative `ts` is older than N×interval, force LOUD even if requests are still pending — a ts-age tripwire independent of the request lifecycle.

### Why this matters
This is arguably **more important than the gauge-flash ticket**: a flashing gauge is annoying; a UI that confidently says "online / all-good" for 40s–minutes after the box is actually dead is the failure mode that makes an operator trust a dead stack. It's the honesty-spine failing against precisely the death it exists to catch. Surfaced the first time the backend was killed under observation (mesh-served client + hang-style death = the real-world reboot path).

### Provenance
Observed live by the warden during a Carlos-ordered simulated-reboot dogfood: backend hard-killed, warden survived, Chrome UI watched. Network trace showed `GET 100.64.0.2:3005/v1/heartbeat` stuck `pending` (not `ECONNREFUSED`) while the UI still read `online`. Pairs with the gauge-flash and honest-liveness tickets (same cockpit, same #0 spine).

## 🔴 N waker/watch instances → every channel wake injected N× (no singleton guard)

### Symptom
Every peer-channel wake is delivered to the target seat **twice** (verbatim duplicate, each with the membrane injection banner), and every `warden-watch` INCIDENT fires **four times** on the channel. A freshly-spawned collaborator (happy-dev) flagged it unprompted on its first turn ("same message, second delivery") and again mid-collaboration ("duplicate #2 — double-waker confirmed live in my inbox").

### Root cause (ground-truthed, not guessed)
There are **2 live `peer-waker.mjs` processes** (pid 13532 + 30280, identical `14:29:03` start) and **4 live `warden-watch.mjs` processes** (pids 25056/24092/23580/25732, started 12:53:56–59). Each waker independently tails `log.jsonl` from its own EOF cursor and injects every addressed message → N wakers = N× injection. Both wakers share one `waker.state.json` (the `injected` counter reflects the doubling). The watch processes likewise each emit their own INCIDENT. Nothing guards against more than one instance: the launcher/supervisor re-spawns the waker/watch on reboot **without reaping or mutex-guarding the prior instance**, so instances accumulate across dogfood reboots.

### Blast radius
- Doubled wakes are mostly benign for idempotent prose (the target reads the same message twice) but **waste a seat turn per duplicate** (real cost on a rate-limited fleet) and **confuse provenance** (a seat can't tell a genuine re-send from an amplified one).
- The per-lane depth-fuse counts only *successful* injects per waker's own state — two wakers each have their own in-memory `recentBy`, so the **global fuse ceiling is effectively doubled** and a runaway is half as likely to trip.
- 4× INCIDENTs amplify any escalation storm 4-fold.

### Fix
Singleton-guard the waker and the watch with a **named-kernel-mutex / pid-lock** — the same shape as the floor-state oracle's `Global\parthy-floor-<id>` mutex (no-compile, power-loss-correct): on start, acquire `Global\peer-waker` (resp. `Global\warden-watch`); if already held, exit 0 (a healthy instance is running). A supervisor respawn then can't stack instances. Belt: the launcher should reap the prior pid before respawn. **Interim manual dedupe:** kill all but one `peer-waker` and all but one `warden-watch` (Carlos-gated — survival infra).

### Provenance
Root-caused by the warden 2026-06-30 while observing the live DOM during the warden⇄happy-dev T1 collaboration; the duplicate delivery happy-dev kept flagging was the tell. Process census confirmed 2 wakers + 4 watches. Proposed as T3 (after the T1 wake-membrane fix + T2 model-selection).
