# Happy stack — final-form plan: bulletproof stack, honest/reliable/lean UI

> Sonnet planning artifact. Read-only audit (failure-log.md + warden-stack-survival.md last ~250 lines + happy-up.ps1/happy-down.ps1 + happy-app sampling) + the congress's own documented vision corpus (unified-surface-vision, cockpit-input synthesis + loom's feel-contracts, happy-dev's lane docs 01-03 + warden-watchdog-ui-design + happy-ui-data-layer-map + Phase 1/2 scope docs) + grounded web research. No code changes. §1 is SYNTHESIZED from the congress's own vision docs, cited inline — not invented here. §2-§4 gap analysis / backlog / sequencing are this audit's own work, scoped to manifest that documented vision and close the lived reliability gaps.

---

## §1 FINAL-FORM DEFINITION

> Distilled from the congress's own lived design work — most of this is partially BUILT and PROVEN already, not speculative. Citations point at the source doc for each criterion.

### The one-line vision (verbatim, the congress's own north-star)
*"The same warm, honest cockpit — built once, lightweight — that meets Carlos in the posture he's in: full-steer at the desk, a glance from bed, an approve on the couch, a pilot from another continent, and a respected wall at work."* — [`unified-surface-vision-2026-06-29.md`](../../../parthenogenesis/congress/unified-surface-vision-2026-06-29.md)

### Bulletproof stack — done-criteria (all measurable)
1. **One command, one true state.** `happy-up.ps1` brings up server(:3005) + web(:8081) + daemon + seats + waker + warden, and exits only after every surface Carlos actually opens is confirmed LISTENING/responsive — not just "process launched." (This audit's synthesis of the failure-log's "GREEN ≠ the UI Carlos opens is up" gap.)
2. **Survives a real reboot with zero manual steps.** A cold boot → `happy-up` → every seat is alive AND wakeable via the channel, with no manual `peer.mjs register`.
3. **No process duplication, ever.** Exactly 1 live instance each of `peer-waker.mjs`, `warden-watch.mjs`, `warden-pty-launcher.mjs` at all times, machine-enforced (kernel object), not convention-enforced — the same Tier-B named-mutex pattern already proven in `floor-state.cjs`.
4. **The watcher is watched.** No single liveness process is a SPOF — a dead `warden-watch` is detected and healed within its own detection budget (~100s). Design exists and is fully specced: [`CHIP2-watcher-supervisor-design.md`](../../../.claude/tools/warden/CHIP2-watcher-supervisor-design.md) (3 layers: launcher↔watch mutual supervision + boot-persistent Scheduled Task backstop) — staged, NOT applied.
5. **GREEN means the human's surface is green.** `warden-status.json` overall=GREEN implies every surface Carlos opens is independently probed — no aggregate hides a dark leaf. This is the literal honesty-spine (§0 below) applied to the stack's own status report, not just the UI.
6. **Self-revival without an OS reboot.** A wedged/crashed warden or seat heals via the supervised loop alone.
7. **Identity survives both churn modes.** Cuid-churn-with-stable-claudeSid is solved (T1, shipped commit bb838bc). ClaudeSid-itself-churning (fresh session, not `--resume`) has a defined, automatic re-registration-by-name path.
8. **The daily-driver surface is lightweight by construction, proven not asserted.** The Tauri/WebView2 shell is the sanctioned daily driver (NOT a Brave tab) — already built, shipped, and measured: **~20× / ~95% RAM reduction vs. live Brave** (419MB / 7 procs vs. 8.7GB / 18 procs), per [`01-lightweight-ui-and-brain-routing.md`](01-lightweight-ui-and-brain-routing.md)'s acceptance-gate measurement. Final-form = this is what `happy-up`/Carlos's daily habit actually opens, not a fallback.

### Honest, reliable, lean UI — done-criteria

**§0 THE HONESTY-SPINE — the one cross-cutting invariant, unanimous across all 8 congress lanes** (aegis, happy-dev, loom, device-health, ai-ops, aide, mentor, overseer each named the SAME requirement in their own vocabulary): *"every state the cockpit renders must FAIL HONEST — a not-done / broken / idle / stale / unverified / uncertain thing must LOOK that way, never a confident green."* — [`cockpit-input/_SYNTHESIS.md`](../../../parthenogenesis/congress/cockpit-input/_SYNTHESIS.md) §0. This is requirement #1, a render invariant not a feature, and it already bit the stack once (the silently-dark roster). Named per-lane fences that are all instances of this ONE rule: staged≠applied (aegis) · built≠live (happy-dev) · broken-feed≠quiet (loom) · stale≠fresh + honest-null-ETA (device-health) · enrolled-but-stalled≠healthy (ai-ops) · idle≠busy (aide) · measured-number≠vibe (mentor) · all-green-board≠hidden-stall (overseer).

9. **Honest:** every rendered liveness signal (●online, gauge value, session label, thought-line) is derived from a fresh ground-truth probe; nothing is hard-coded ("every UI element needs to be derived, not hard-coded" — Carlos's verbatim north-star, cited in [`happy-ui-data-layer-map.md`](happy-ui-data-layer-map.md)). A feed that can't prove freshness renders LOUD-dead within its detection budget, never a calm stale value (the three-state feed discipline: RENDER / QUIET / LOUD, never collapsing to two — [`useHonestFeed.ts`](../../packages/happy-app/sources/hooks/useHonestFeed.ts)). Measurable: time-to-LOUD ≤ ~12-15s from actual backend death, regardless of hang-vs-refuse failure mode.
10. **Reliable:** the daily-driver surface (Tauri shell, pointed at the self-host server) is what `happy-up` brings up and verifies live before declaring "stack up" — a dead backend produces an actionable, state-evolving offline experience, not a bare 503 or a frozen lie.
11. **Lean:** no layout-thrash — gauge cards have reserved heights so a poll never reflows the session list; data references are stable; the daily-driver is the measured-lightweight Tauri/WebView2 shell, not a second Chromium stack; **"boring when healthy"** — a calm, quiet resting state Carlos can look away from, only the one broken thing draws the eye ([`phase1-oversee-lane-tiles-scope.md`](phase1-oversee-lane-tiles-scope.md)); **never "TERMINALPOCALYPSE"** — the cockpit must never become a wall-of-terminals/spam-feed; signal not noise is the honesty-spine's explicit twin ("#0 says never lie, this says never SPAM" — Carlos, captured in [`_SYNTHESIS.md`](../../../parthenogenesis/congress/cockpit-input/_SYNTHESIS.md) "night-additions").
12. **Posture-adaptive, capability-invariant (the unified-surface design target).** One modular core (Happy) renders adaptively per posture (desktop full-steer / phone glance+approve / deck couch-pilot / remote-pilot projected / Loki firewalled-off) — atoms (tile, knock-card, gauge, thought-line) built once, composed five ways. **Capability is posture-invariant; only default-altitude and density vary** — the phone is the full cockpit at lower default density, not a crippled subset, and consequential-confirm gates (COST/GIT-push/DESTRUCTIVE) travel with it, never dropped on a small surface. Per [`unified-surface-vision-2026-06-29.md`](../../../parthenogenesis/congress/unified-surface-vision-2026-06-29.md) Part 2, resolved by Carlos 2026-06-29. **This is the long-horizon target, not Phase-1 scope** — see the conflict-flag below.
13. **Warm, not a console.** Character lives in the copy, relate-don't-report, the thought-line names the specific work-object and never a bare gerund ("designing"/"overseeing"/"building" are explicitly banned — unanimous across all 8 lanes per `_SYNTHESIS.md` §1). The Warden Watchdog's "quiet presence" state — render almost nothing when all is green — is the concrete worked example: [`warden-watchdog-ui-design.md`](warden-watchdog-ui-design.md).
14. **Dependency/bundle discipline tracked, not asserted.** Production dependency count and bundle size are measured via Expo Atlas and trend flat-to-down (currently 156 prod deps in happy-app — no fixed target without a baseline run). This is this audit's own addition (the congress's vision corpus does not set a bundle budget) — flagged as such, not over-claimed as congress-sourced.

### Conflict flag — for Carlos, not resolved here
Two of the congress's own documents point at **different primary daily-driver surfaces**, and this plan does not pick a winner:
- **happy-dev's lane docs (01, build results)** establish the **Tauri/WebView2 desktop shell** as THE daily driver, explicitly **replacing** the Brave-tab/`:8081` workflow, with a measured ~20× RAM win as the proof. The self-host build even bakes `EXPO_PUBLIC_HAPPY_SERVER_URL` for this shell specifically.
- **The failure-log + warden-stack-survival threads** (the operational/survival side, most recent — 2026-06-30) are still entirely framed around **`http://localhost:8081`** as "Carlos's normal, proven workflow... we have DONE this, proven" — and file the boot-path gap, the SW-503 masking, and the gauge-flash tickets all against the **:8081 browser surface**, with no mention of the Tauri shell as the target.
- These aren't necessarily contradictory (the Tauri shell *loads* the same web export that `:8081` serves in dev — they could converge), but **the two corpora currently treat different surfaces as canonical** without an explicit reconciliation doc. PR-1 in §3 below (boot the web client) fixes the *literal* ticket as filed (which names :8081) — but if the Tauri shell is meant to supersede :8081 as the daily driver, the actual fix might be "boot the Tauri shell instead of/in addition to :8081," which is a different PR. **Flagging for Carlos's call before PR-1 ships**, rather than silently picking one.

---

## §2 GAP ANALYSIS

### Stack-reliability gaps
- **G1 — web UI not in boot path.** `workshop/happy-up.ps1` (lines 1-297) starts server/daemon/boot-resume/waker/warden but never starts `:8081`. Closing banner ("Open http://localhost:8081") points at a server it never started. Evidence: failure-log "web UI (localhost:8081) is not in happy-up's boot path."
- **G2 — no singleton enforcement on waker/watch/launcher.** `happy-up.ps1`'s `Test-LoopStale`/`Get-LoopProc` (lines 63-103) is a soft, racy, TOCTOU-prone process-census guard, not a kernel-enforced singleton. Live-confirmed: 2 `peer-waker.mjs`, 4 `warden-watch.mjs`, 2 `warden-pty-launcher.mjs` simultaneously. Evidence: failure-log "N waker/watch instances," warden-thread 2026-06-30 ~21:26Z "REAL CYCLE RESULT."
- **G3 — watcher-needs-watching unsolved.** `warden-watch.mjs` is a SPOF; nothing supervises it post-boot. CHIP2 3-layer design exists (`CHIP2-watcher-supervisor-design.md`) but is staged, NOT applied — awaits overseer-go + Carlos for the elevated (Scheduled Task) layer.
- **G4 — claudeSid-churn case unhandled.** T1 (`shared-liveness.mjs`, shipped commit bb838bc) solves cuid-churn-with-stable-claudeSid. The 2026-06-30 real-cycle test found a SECOND failure mode: claudeSid itself changes (fresh session, not `--resume`) → `resolveLiveCuid()` correctly fails closed to the dead stored cuid, with no recovery path. Needs name-based re-registration.
- **G5 — boot-resume coverage gap.** Per the same real-cycle test, `desk`'s claudeSid never reappeared post-cycle; `happy-up.ps1`'s boot-resume step (lines 168-182) only covers desk+overseer per its own comment, and even that pair showed a miss. Unclear if expected (Carlos's interactive seat) — flagged as an open question, not assumed.
- **G6 — self-revival needed a full OS reboot.** Per the task brief's known-gaps list: warden self-revival is unreliable enough that recovery has required a full reboot rather than the supervised loop healing it. Root cause not yet isolated to one mechanism — likely compounds G2+G3 (duplicate/flapping launcher eating the brain's continuity, turnCount resetting on every relaunch per the 2026-06-30 21:26Z finding).
- **G7 — escalation ladder has a black hole.** When the overseer is daemon-lost, the warden's only escalation rung (probe-overseer) silently never resolves — no DESK rung, no timeout-to-Carlos. Evidence: failure-log "overseer daemon-loss → warden escalation probe is a black hole."
- **G8 — cwd mis-stamping (5th variant of a recurring bug class).** `register` stamps the invoking process's cwd, not the seat's true cwd; `boot-resume` reads the wrong cwd → wrong fork-backfill path → ENOENT → fake "crash." Healed live via self-register but the durable fix (boot-resume must spawn each seat in its TRUE cwd, sourced from the seat's own process) is still owed. Evidence: warden-thread 2026-06-29 "FORK RESOLVED" section.
- **G9 — `happy-down.ps1`/`happy-up.ps1` don't pair on the web client.** happy-down's `winTargets` (lines 182-191) matches the web client process for teardown, but happy-up never starts it — so the down/up pair is asymmetric (can tear down something that's never brought up automatically).

### UI-honesty gaps
- **G10 — liveness dot lies (online + dead simultaneously).** UI reads a live PID as "online" without reconciling against a turn-liveness/transcript signal. Evidence: failure-log "(a) Liveness dot."
- **G11 — session label = cwd, not seat role.** Caused a real operator error (Carlos archived the live overseer believing it was a dup). Evidence: failure-log "(b) Session label."
- **G12 — pane shows empty despite live backfilled history.** The fork-backfill env var is set but the pane doesn't render it. Evidence: failure-log "(c) Pane shows No messages."
- **G13 — honest-dead transition stalls against a HANGING (not refused) backend.** `useHonestFeed.ts` (confirmed read, lines 84-104) only counts a *settled* rejection as failure; a `pending` mesh-hung fetch counts as neither success nor failure, so `unreachable` never flips and stale data displays as confidently "online" for 40s-minutes. Root cause precisely located: no per-poll `AbortController` timeout in the `poll()` function. Evidence: failure-log "honest-dead transition stalls," confirmed in source.
- **G14 — `●online` indicator not reconciled against poll-liveness.** Same root family as G10/G13 — a killed seat still reads online because the dot isn't derived from the same honest-feed discipline `useHonestFeed` already provides to gauges.
- **G15 — self-host context meter is data-starved, not just display-gated.** `AgentInput.tsx:600` gates render on `usageData?.contextSize` (truthy check, also brittle re: `0` being falsy — separate nit). Root cause is upstream: the self-host path's `usage` event never reaches `processUsageData` (`reducer.ts:1150-1161`). Open severity question: does CC fall back to local tokenization, or is auto-compact itself blind on self-host (safety issue, not just cosmetic).
- **G16 — congress can imply liveness of a non-running lane.** The overseer routed a Chrome question to "happy-dev" as if it were live; it wasn't a running process. Worker-trust discipline (already applied elsewhere in this stack, e.g. the building's floor-state oracle) isn't yet applied to congress self-reports.

### UI-reliability gaps
- **G17 — service worker masks the entire down+recovery arc behind a bare, undifferentiated 503.** Three distinct realities (backend fully dead / recovering / web host still binding) are visually identical — operator gets zero signal that recovery is underway. Evidence: failure-log "Recording — the SW-503 masks the ENTIRE recovery window," with full timing data (bind ~3s, first bundle ~1.7s once actually started).
- **G18 — page refresh makes the dead state WORSE, not better**, once :8081 is down (SW intercepts and serves synthetic 503 instead of letting the SPA's in-memory state — even if stale-lying — persist).
- **G19 — gauge↔FeedUnreachable-banner swap has no shared height**, so every reboot causes a hard visual flash+reflow on top of the dead-state confusion (overlaps with G20 below but is a distinct reliability symptom: the chrome itself is unstable during the exact window the operator needs it most).

### UI-leanness gaps
- **G20 — cockpit gauges flash + reflow the session list every poll (worst during reboots).** Full traced root cause (confirmed structurally: `SessionsList.tsx:523-546`, gauge mounted at `:539` inside `ListHeaderComponent`, three gauges `ContextGauge`/`VramGauge`/`DiskGauge` imported lines 28-30): (1) `useHonestFeed` creates a fresh object/array ref every successful poll even when data is near-identical → forced re-render every 5s; (2) `VramGauge.tsx` (262 lines; confirmed only fixed `height: 8` styles are the bar-fill, not card-level min-height) has no reserved card height — conditional rows (consumer list set-churn, trend-line null-toggle, verdict/reclaimable/orphanNote) change height on every poll; (3) `FeedUnreachable` banner swap is a different height than the live gauge, causing a hard jump exactly when reboots stress the feeds hardest.
- **G21 — 156 production dependencies, no bundle-size budget or tracking.** Expo Atlas (the 2026 standard tool for this exact problem per research below) is not wired in; no CI/manual gate on bundle growth. Web platform is explicitly "secondary" per the app's own CLAUDE.md, yet carries the full native-app dependency surface (LiveKit voice, libsodium, Skia avatars, etc.) into the web bundle by default.
- **G22 — no async/route-level code splitting confirmed.** Not verified either way in this audit (would require an Atlas bundle report) — flagged as an open measurement gap, not a confirmed defect.

---

## §3 PR-BACKLOG

Each PR is small, independently reviewable, and shippable on its own. Lane key: **sonnet-implementer** (straightforward code, low risk) · **happy-dev** (the INSIDE lane that owns this repo's root-cause fixes per the failure-log's loop) · **warden-gate** (touches the survival/elevated layer — Carlos+overseer gated, never unilateral).

### PR-0 — Reconcile the daily-driver surface (Carlos decision, not a build PR)
- Scope: NOT code — a short decision doc/conversation resolving the conflict flagged in §1: is the Tauri/WebView2 shell THE daily driver (superseding :8081), is :8081 still canonical for some flows (e.g. phone/web access per the unified-surface vision's posture map), or do both stay live for different postures? This decides whether PR-1 below should boot :8081, boot the Tauri shell, or both.
- Files: none (or a one-page decision note in `docs/lane-happy-dev/` once made).
- Acceptance: a written answer Carlos has confirmed, that PR-1 can cite.
- Dependencies: none — blocks nothing else from starting, but PR-1's exact shape should wait on this if possible.
- Parallelizable: yes (can run alongside everything else; only PR-1 truly needs the answer before it ships, not before it starts).
- Lane: n/a (Carlos call, relayed via overseer/loom).

### Stack-reliability PRs

**PR-1 — Boot the daily-driver surface in happy-up.ps1**
- Scope: add a step that starts the canonical daily-driver surface (per PR-0's answer — likely `pnpm --filter happy-app web` for :8081, and/or launching the Tauri shell binary) and polls it live before printing the "stack up" banner. As filed, the failure-log ticket names :8081 specifically — implement that literal fix if PR-0 confirms :8081 stays canonical; adjust target if PR-0 redirects to the Tauri shell.
- Files: `workshop/happy-up.ps1` (insert after step 2 "Client," before or alongside step 3 "Daemon"; mirror lines 108-124's Test-Listening pattern), `workshop/happy-down.ps1` (already tears down the web client at lines 182-191 — verify symmetry).
- Acceptance: cold `happy-up.ps1` run → the canonical surface confirmed live by the script itself within a bounded timeout (suggest 45s, matching the server's pattern) before the closing banner prints; banner only prints a URL/launch confirmation if the probe succeeded.
- Dependencies: PR-0 (soft — can start before, should confirm target before merge).
- Parallelizable: yes.
- Lane: happy-dev.

**PR-2 — `webUIReach` check in warden-status.json**
- Scope: add an 8081 liveness probe to whatever assembles `warden-status.json` so a dark web surface shows RED even if server/daemon/waker/seats are all green.
- Files: warden status-assembly script (locate via `warden-status.json` writer — likely in `.claude/tools/warden/warden-watch.mjs` or a sibling oracle module).
- Acceptance: kill the web client only (server/daemon untouched) → `warden-status.json.overall` flips to non-GREEN with a `webUIReach: down` field; restoring `:8081` flips it back without restarting anything else.
- Dependencies: PR-1 (needs something to probe against).
- Parallelizable: no (sequenced after PR-1).
- Lane: happy-dev.

**PR-3 — Kernel-mutex singleton for peer-waker.mjs**
- Scope: port the proven Tier-B named-mutex pattern already live in `.claude/tools/floor-state.cjs` (`Global\parthy-floor-<id>-<nonce>`, no-compile, power-loss-correct) to `peer-waker.mjs`: acquire `Global\peer-waker` on start, exit 0 if already held.
- Files: `~/.claude/peer-channel/peer-waker.mjs`, reuse `floor-state.cjs`'s mutex-acquire helper (extract to a tiny shared module if not already factored).
- Acceptance: start 2 wakers back-to-back → exactly 1 stays alive, the second exits cleanly (not crash) within 1s; kill the live one → a respawn from `happy-up.ps1` succeeds (mutex released on process exit).
- Dependencies: none (independent of PR-1/2).
- Parallelizable: yes.
- Lane: happy-dev (design), warden-gate (apply if it touches the always-on waker in a live session — low risk, but the file is survival-infra).

**PR-4 — Kernel-mutex singleton for warden-watch.mjs + warden-pty-launcher.mjs**
- Scope: same pattern as PR-3, applied to the two remaining duplicating processes (4 watches + 2 launchers observed live).
- Files: `.claude/tools/warden/warden-watch.mjs`, `.claude/tools/warden/warden-pty-launcher.mjs`.
- Acceptance: same shape as PR-3's acceptance, run against both processes; live dogfood through one real happy-down/happy-up cycle shows exactly 1 of each post-cycle.
- Dependencies: PR-3 (reuse the same shared mutex helper — sequence to avoid duplicate implementations).
- Parallelizable: no (sequenced after PR-3 for the shared helper; the two files' own changes can be done in one PR or two parallel sub-PRs once the helper lands).
- Lane: warden-gate (this is explicitly the elevated/survival layer — Carlos+overseer gated per the CHIP2 design's own framing; T3 in the warden-thread).

**PR-5 — Apply CHIP2 Layer 1 (launcher supervises watch, in-process)**
- Scope: implement the design's Layer 1 exactly as specced — launcher's existing poll loop gains a `warden-status.json` mtime staleness check (>~100s) → PID-live-guarded reap+relaunch of warden-watch, with the K=3/10min flap-breaker.
- Files: `.claude/tools/warden/warden-pty-launcher.mjs`, generalize `.claude/tools/warden/reap-relaunch-watch.ps1` per the design's "shared helper" section (parameterize `-TargetPid`, discover-by-cmdline if absent).
- Acceptance: kill `warden-watch` directly → launcher detects + relaunches within ~100s, confirmed via a fresh `watchPid` in launcher state and a fresh `warden-status.json` mtime; induce 4 kills in 10 min → breaker trips, launcher stops auto-reaping and escalates instead of flapping.
- Dependencies: PR-4 (singleton must land first — supervising a duplicating process compounds the bug per the design doc's explicit ordering note about T1b).
- Parallelizable: no.
- Lane: warden-gate (explicitly named in the design as overseer-go + Carlos-gated).

**PR-6 — Apply CHIP2 Layer 2 (mutual watch-watches-launcher)**
- Scope: launcher writes `warden-launcher-beat.json {ts,pid}` each poll; watch reads it and escalates-to-Carlos (no self-heal) if the launcher goes stale.
- Files: same two files as PR-5.
- Acceptance: kill the launcher only → watch detects within its own poll interval and emits a channel escalation distinguishable from a normal INCIDENT.
- Dependencies: PR-5.
- Parallelizable: no.
- Lane: warden-gate.

**PR-7 — CHIP2 Layer 3 (boot-persistent Scheduled Task backstop)**
- Scope: register a Windows Scheduled Task (at-logon + every N min) that re-runs happy-up's exact bring-up for any of the two survival processes found missing.
- Files: new `.ps1` (the design doc says "stage the .ps1 + a schtasks/Register-ScheduledTask script; do not register without his go") + a one-time registration step.
- Acceptance: a simulated dual-death (kill both launcher and watch) → the Scheduled Task fires within N minutes and both processes are back, independently of Layers 1-2.
- Dependencies: PR-5, PR-6 (logically the outer layer; can be drafted in parallel but must not be registered before the inner layers are proven, per the design doc's own build order).
- Parallelizable: drafting yes, registration no.
- Lane: warden-gate (explicitly Carlos-gated — elevated Scheduled Task).

**PR-8 — Re-register-on-resume (durable fix for both churn modes)**
- Scope: `boot-resume` re-registers each seat from the seat's OWN resumed process (stamping fresh cuid+claudeSid+cwd), closing the gap T1's waker-side belt-fix doesn't reach. Must run AFTER the daemon attaches the resumed session's new cuid (timing trap noted in the warden-thread) — either sequence it post-attach or have it resolve via daemon `/list` itself rather than assuming ancestry.
- Files: `.claude/tools/boot-resume-lanes.ps1` (referenced at `happy-up.ps1:175`), `~/.claude/peer-channel/peer.mjs` (the `register` command, invoked with `PEER_SEAT=<seat>` from the seat's own process per the existing manual-unblock pattern).
- Acceptance: a full happy-down→happy-up cycle (not just live-resume) → every seat record's cuid matches its live process's actual cuid, with zero manual `peer.mjs register` calls; verified against the existing `verify-rebirth.mjs`-style churn-check the warden already uses.
- Dependencies: none structurally, but should land before/alongside the next real-cycle dogfood to get a clean proof.
- Parallelizable: yes (independent of the watcher-singleton work).
- Lane: happy-dev.

**PR-9 — Name-based re-registration for claudeSid-churn (fresh-session case)**
- Scope: when `resolveLiveCuid()` fails closed (no live pid carries the OLD claudeSid — a genuinely new session, not a `--resume`), fall back to resolving the live seat by registered NAME (not claudeSid) — find the current live process tagged `PEER_SEAT=<name>` and adopt its fresh claudeSid+cuid.
- Files: `~/.claude/peer-channel/shared-liveness.mjs` (the T1 module, 109 lines per the warden-thread commit note), `peer-waker.mjs`.
- Acceptance: simulate a fresh-session churn (kill a seat, relaunch WITHOUT `--resume` so claudeSid changes) → waker resolves the new live cuid via name-lookup and delivers a wake successfully, no manual intervention.
- Dependencies: PR-8 conceptually related but independently shippable.
- Parallelizable: yes.
- Lane: happy-dev.

**PR-10 — Escalation-ladder DESK rung (close the probe-black-hole)**
- Scope: implement the already-specced T1c extension — probe overseer → timeout → reap-request to desk → timeout → Carlos, with the flap-breaker and skip-dead-rung clause exactly as written in the failure-log ticket.
- Files: warden escalation logic (wherever T1c currently lives — likely `warden-watch.mjs` or a dedicated escalation module) + a new desk-side "reap+respawn canonical action" (named, idempotent script/function per the ticket's "Happy-side dependency" note).
- Acceptance: simulate overseer daemon-loss → escalation reaches the desk rung (not silently hung) → desk reap+respawn fires → new overseer self-registers → ladder resolves without reaching Carlos; simulate desk ALSO daemon-lost → ladder skips straight to Carlos.
- Dependencies: PR-8 (reap+respawn-as-canonical-action benefits from the same re-register-on-resume primitive).
- Parallelizable: yes relative to the watcher-singleton track.
- Lane: happy-dev.

**PR-11 — boot-resume cwd-source fix (5th stamp-bug variant, durable)**
- Scope: `boot-resume` must source each seat's cwd from the seat's OWN process's true working directory, not the registrar's invoking cwd.
- Files: `.claude/tools/boot-resume-lanes.ps1`, `canonical-seats.json` schema/writer.
- Acceptance: corrupt the canonical overseer cwd by hand → next boot-resume cycle self-heals it from the live process, not from a stale hand-patched record.
- Dependencies: none.
- Parallelizable: yes.
- Lane: happy-dev.

### UI-honesty PRs

**PR-12 — Per-poll timeout in useHonestFeed (fixes the hang-vs-refuse blind spot)**
- Scope: wrap each `fetcherRef.current(credentials)` call in `useHonestFeed.ts`'s `poll()` (line 88) with an `AbortController` + short deadline (~4s, under the 5s interval); a poll that doesn't settle counts as a failure via the existing `markFailure()` path.
- Files: `packages/happy-app/sources/hooks/useHonestFeed.ts` (lines 84-104, the `poll` function).
- Acceptance: simulate a HUNG (not refused) backend (mesh SYN-accepted, nothing listening) → `unreachable` flips to true within `~timeout × unreachableAfter` (~12s), matching the already-working ECONNREFUSED case's speed.
- Dependencies: none.
- Parallelizable: yes — this is the single highest-leverage, lowest-risk PR in the whole backlog (one function, isolated, well-understood root cause already traced to source).
- Lane: sonnet-implementer.

**PR-13 — Reconcile `●online` against poll-liveness**
- Scope: derive the online/offline dot from the same honest-feed verdict the gauges already use, instead of a raw socket/last-known-state read.
- Files: wherever the session-row `●online` indicator is rendered (likely `SessionsList.tsx` or `ActiveSessionsGroupCompact.tsx`) + whatever hook backs it.
- Acceptance: kill a seat's process → its row's dot flips to dead within the same ~12-15s window as PR-12's gauges, never staying "online" against a provably dead process.
- Dependencies: PR-12 (same honesty-spine primitive).
- Parallelizable: no (sequenced after PR-12 to reuse its fix).
- Lane: sonnet-implementer.

**PR-14 — Derive ONE reconciled liveness verdict (kills the online+dead-at-once dot)**
- Scope: per the failure-log's explicit fix direction, build one verdict function (resumed-but-idle vs took-a-post-boot-turn vs genuinely-dead) the way `floor-state.cjs` already does for the building (pid-identity + turn-beat, fail-closed) — apply the SAME pattern, don't reinvent it.
- Files: new shared derivation (e.g. `sources/sync/liveness.ts`), consumed by the session-row renderer.
- Acceptance: a resumed-but-idle seat and a genuinely-dead seat render visibly distinct states; a contradictory raw-signal pair (live PID + idle brain) never collapses into a single ambiguous "online."
- Dependencies: PR-13.
- Parallelizable: no.
- Lane: happy-dev.

**PR-15 — Session label = seat role, not cwd**
- Scope: derive the rendered label from the registered seat role (overseer/desk/ai-ops) via the congress roster, falling back to cwd only when unregistered.
- Files: session-row label component (search `SessionsList.tsx` / `ActiveSessionsGroupCompact.tsx` for cwd-as-label logic), `useCongressRoster.ts` (already exists as a hook — likely the right join point).
- Acceptance: the overseer (cwd `~/.claude/peer-channel`) renders as "Overseer," never as "peer-channel / New chat"; this directly prevents the operator-error class that already cost a live-overseer archive.
- Dependencies: none (independent fix, can run in parallel with the honesty-spine track).
- Parallelizable: yes.
- Lane: sonnet-implementer.

**PR-16 — Pane content from transcript fork-backfill, not the Happy message record**
- Scope: when `HAPPY_FORK_CLAUDE_SESSION_ID` is set on resume, derive the rendered pane content from the actual claude transcript (the fork-backfill), not the possibly-fresh/empty Happy-session message record.
- Files: pane/message-rendering data source (`sync/reducer/reducer.ts` and whatever component renders `MessageView.tsx`/`ChatList.tsx`).
- Acceptance: a resumed seat with 200+ backfilled transcript messages shows them in the pane, not "No messages yet."
- Dependencies: none.
- Parallelizable: yes.
- Lane: happy-dev (touches the sync/reducer core).

**PR-17 — Forward self-host `usage` payload to the reducer (context-meter + auto-compact safety)**
- Scope: per the failure-log's diagnosis-first plan — STEP 1: instrument the self-host usage-forwarding path to confirm whether `usage` events reach `processUsageData` at all (and resolve the load-bearing unknown: does CC fall back to local tokenization, or is auto-compact itself blind). STEP 2: fix at source (server relay or CC stream forwarding) so `latestUsage.contextSize` populates with zero display-side change needed.
- Files: `packages/happy-cli/src/claude/*` (stream→session forwarding), self-host server's message relay; the display fix at `AgentInput.tsx:600`/`:96` rides along once data flows (the `!= null` guard nit + model-aware `MAX_CONTEXT_SIZE`).
- Acceptance: STEP 1 produces a definitive answer to the local-tokenization-fallback question (escalation point if the answer is "no fallback" — this becomes a safety bug, re-triage severity); STEP 2's done-criteria = a self-host session's context meter renders a live, non-zero percentage matching Claude Desktop's gauge for the same session.
- Dependencies: none, but STEP 1 should run before scoping STEP 2's effort.
- Parallelizable: yes.
- Lane: happy-dev (STEP 1 diagnosis), sonnet-implementer (STEP 2 once root-caused).

**PR-18 — Congress liveness honesty (don't imply a non-running lane is live)**
- Scope: apply the same worker-trust discipline the building's floor-state oracle already encodes (derive, fail-closed, never trust an implied/cached state) to congress self-reports — a lane reference must resolve against an externally-attested-alive check before being routed to.
- Files: wherever congress routing/self-report logic lives (likely `seats-oracle.mjs` or the overseer's own routing logic, not strictly an happy-app UI file — may be congress-side, flag for triage).
- Acceptance: asking the congress to route to a non-running lane produces an honest "not currently running" response, never an implied-live routing.
- Dependencies: none.
- Parallelizable: yes.
- Lane: happy-dev.

### UI-reliability PRs

**PR-19 — Honest, state-evolving offline page in the service worker**
- Scope: replace the bare synthetic 503 with a real offline page that distinguishes (a) backend fully dead, (b) recovering, (c) web host still binding — polling `:3005`/`:8081` and auto-reloading when the host returns, per the failure-log's explicit recommendation ("state-evolving... not a static 503"). This is flagged in the source ticket as "the highest-value SW fix... the only surface the user has during the entire down+recovery arc."
- Files: the Expo/web service-worker source (locate via `expo-pwa`/`sw.js` equivalent in `packages/happy-app`).
- Acceptance: kill the backend, refresh the tab → an honest "Happy backend is down" page with live status, not a bare titled-"localhost" dead frame; bring the backend back → the page auto-detects and reloads without a manual refresh.
- Dependencies: PR-1 (needs :8081 in the boot path to have something to detect coming back).
- Parallelizable: yes relative to other tracks.
- Lane: sonnet-implementer.

**PR-20 — Reserved height for FeedUnreachable banner = the gauge it replaces**
- Scope: same fixed-height treatment as PR-21 below, applied specifically to the dead/alive swap component so reboots don't double-jolt the list (data-thrash AND state-swap thrash are two distinct reflow sources, both fixed by reserved geometry).
- Files: the shared `FeedUnreachable` component + `VramGauge.tsx`/`ContextGauge.tsx`/`DiskGauge.tsx`.
- Acceptance: toggling a gauge between live and FeedUnreachable causes zero layout shift in the session list below it (verify via a fixed-height assertion or visual diff in a manual smoke pass).
- Dependencies: PR-21 (share the same height-reservation mechanism).
- Parallelizable: no.
- Lane: sonnet-implementer.

### UI-leanness PRs

**PR-21 — Reserve stable height per gauge card (the single highest-leverage UI-leanness fix)**
- Scope: per the failure-log's own "smallest-first" fix ordering — give `VramGauge`/`ContextGauge`/`DiskGauge` a min-height (or render optional lines as fixed-height placeholders) so internal content toggles never reflow the list.
- Files: `packages/happy-app/sources/components/VramGauge.tsx` (262 lines), `ContextGauge.tsx` (220 lines), `DiskGauge.tsx` (255 lines).
- Acceptance: with the VRAM consumer-list set churning (procs flickering in/out of top-6) and the trend-line null-toggling, the card's rendered height never changes; session list below stays pinned.
- Dependencies: none.
- Parallelizable: yes — independently shippable from the data-layer fix (PR-22).
- Lane: sonnet-implementer.

**PR-22 — De-flicker the data layer in useHonestFeed (skip setState on deep-equal payloads)**
- Scope: in `useHonestFeed.ts`'s fresh-read branch (line 92, `setState({ data: res.data, unreachable: false })`), skip the state update when the new payload is deep-equal to the last-good one, keeping the prior object reference so `useVram`'s `useMemo` doesn't recompute every 5s for no semantic change.
- Files: `packages/happy-app/sources/hooks/useHonestFeed.ts`.
- Acceptance: a stable VRAM reading (no real change) does not trigger `VramGauge` re-render on every poll (verify via React DevTools profiler or a render-count assertion); a genuine change still adopts immediately (no added latency on real updates).
- Dependencies: PR-12 shares the same hook — sequence to avoid a merge conflict, not a hard logical dependency.
- Parallelizable: yes (can be done alongside PR-12 with care, or immediately after).
- Lane: sonnet-implementer.

**PR-23 — Stabilize the VRAM consumer list (fixed row count / stable threshold)**
- Scope: render a fixed row count (pad to N with empty slots) and/or filter to a stable MB threshold so sub-0.1GB transient procs don't bounce in/out of the visible top-6, which currently changes row count (and thus height) every poll.
- Files: `VramGauge.tsx`.
- Acceptance: a transient sub-threshold process (e.g. csrss flickering) never causes a visible row-count change in the gauge.
- Dependencies: PR-21 (height reservation makes this a pure polish pass rather than a thrash-prevention necessity, but both should land together for full effect).
- Parallelizable: yes.
- Lane: sonnet-implementer.

**PR-24 — Lift the three gauges out of the FlatList header (structural)**
- Scope: per the failure-log's "optional structural" suggestion — move `ContextGauge`/`VramGauge`/`DiskGauge` out of `SessionsList.tsx`'s `ListHeaderComponent` (lines 523-546) into a fixed, non-scrolling region so their internal reflow can structurally never touch the session rows, independent of whether PR-21's height-reservation is perfect.
- Files: `SessionsList.tsx`, the screen/layout component that hosts `SessionsList`.
- Acceptance: even with PR-21 deliberately reverted (worst case), gauge reflow cannot move the session list — the FlatList's scroll region is structurally isolated from the gauge region.
- Dependencies: PR-21, PR-22 (do the cheap fixes first; only reach for the structural move if PR-21/22 don't fully kill the thrash in dogfood).
- Parallelizable: no — this is the fallback/belt fix, sequence last.
- Lane: happy-dev (layout-structural change, higher review bar than a leaf-component edit).

**PR-25 — Wire Expo Atlas + establish a bundle-size baseline**
- Scope: run Expo Atlas (the 2026-standard analyzer per research) against the web build to get a first real bundle report; identify any duplicate-version or unused-import bloat among the 156 production deps; do NOT remove dependencies blind — measure first.
- Files: none changed beyond tooling config (`app.json`/`metro.config.js` Atlas wiring), output is a report, not a diff.
- Acceptance: a committed/shared bundle report exists with a baseline KB figure for the web build; at least 3 concrete candidates for trim or lazy-load are identified with evidence (not guesses).
- Dependencies: none.
- Parallelizable: yes.
- Lane: sonnet-implementer.

**PR-26 — Act on PR-25's findings (route-level code splitting / dead-dependency removal)**
- Scope: whatever PR-25 concretely surfaces — e.g. confirm/implement async route splitting (Expo Router v6 supports per-page bundles), drop or lazy-load native-only deps (LiveKit voice, Skia) from the web bundle path given the app's own CLAUDE.md already states "web is a secondary platform... avoid web-specific implementations" (the inverse trim: avoid shipping native-only weight TO web).
- Files: TBD per PR-25's report.
- Acceptance: a measured bundle-size reduction (target set after PR-25's baseline, not blind) with zero regression in `pnpm typecheck` / existing tests.
- Dependencies: PR-25 (hard dependency — this PR cannot be scoped without its data).
- Parallelizable: no.
- Lane: sonnet-implementer.

### Manifest-the-documented-vision PRs
> These close the gap between what the congress has already SPECCED (and partly built/proven) and what's actually live. Not invented here — each cites its source design doc.

**PR-27 — Generalize the LOUD-guard (three-state honest feed) to warden + disk-sentinel**
- Scope: `useHonestFeed`'s three-state discipline (RENDER/QUIET/LOUD) already governs the congress-roster feed; per [`phase1-oversee-lane-tiles-scope.md`](phase1-oversee-lane-tiles-scope.md) and the Phase 1→2 scaffold plan, `useWarden` and the disk-sentinel feed still keep-last-good silently — same masking risk as the roster bug that already bit once.
- Files: `sources/hooks/useWarden.ts`, `sources/hooks/useDisk.ts` (or equivalent disk-sentinel hook) — apply `useHonestFeed` (or its discipline) uniformly.
- Acceptance: killing the warden-status or disk-sentinel data source produces the same LOUD `FeedUnreachable` behavior the roster already has, within the same ~12-15s budget as PR-12.
- Dependencies: PR-12 (same hook family — sequence together).
- Parallelizable: yes alongside PR-13/14.
- Lane: happy-dev.

**PR-28 — OVERSEE health-decomposition (moodlets) — surface named causes, not a bare score**
- Scope: per the unanimous cross-lane requirement in `_SYNTHESIS.md` §1 and the Phase 1→2 scaffold's cut #1 — render the 2-3 named causes behind a tile's health color ("−context 78%", "+just compacted", "−N tool errors") instead of a bare green/amber/red. Compose from roster signals already flowing (`contextFill`, `lastCompact`, `bytesSinceCompact`) per infra's `health{score,causes}` contract.
- Files: the Hearthside tile/row renderer (`SessionsList.tsx` / `ActiveSessionsGroupCompact.tsx`), congress roster types/hook.
- Acceptance: hovering/tapping a degraded tile shows its specific causes, not just a color; a healthy tile shows nothing extra (boring-when-healthy preserved).
- Dependencies: requires infra's `health{score,causes}` field landing in the roster payload (cross-repo — flag as an external dependency if not yet shipped).
- Parallelizable: yes.
- Lane: happy-dev.

**PR-29 — Directional-bottleneck light + direction-in-words**
- Scope: per `_SYNTHESIS.md` §5 (unanimous, all 8 lanes) — one glyph + voiced direction: upstream-stuck ("waiting on your answer") vs downstream-stuck ("output blocked"), giving Carlos a uniform steer (upstream→answer-a-gate, downstream→fix-the-substrate). Phase 1 scope already includes the glyph as dark-until-data; this PR lights it up once `bottleneck{direction}` flows.
- Files: tile renderer (bottleneck glyph component, already scaffolded dark-safe per `phase1-oversee-lane-tiles-scope.md`), thought-line voicing logic.
- Acceptance: a lane with an open for-Carlos knock shows the downstream glyph + "output blocked" wording; a lane waiting on a dependency shows upstream + "waiting on X."
- Dependencies: infra's `bottleneck{direction}` field (cross-repo, same caveat as PR-28).
- Parallelizable: yes, can pair with PR-28.
- Lane: happy-dev.

**PR-30 — Warden Watchdog UI, Slice 1 (quiet-presence + knock-cards + honest-death pip)**
- Scope: the approved-feel design ([`warden-watchdog-ui-design.md`](warden-watchdog-ui-design.md), "the feel lands" — Carlos 2026-06-28) Slice 1: read-only render of `for-carlos.json` as knock-cards (from/q/ctx/ref shape, red-edge=incident vs lilac-edge=needs-call) + the self-aging honest-death pip (green<60s, greying 60s-stale, grey-dead>60s, computed client-side on `warden-status.ts` not trusted from the file).
- Files: new component(s) per the design's pointers (data already exists: `~/.happy-selfhost/warden-status.json` + `for-carlos.json` + `warden-escalations.jsonl`, no schema changes needed) — likely under `sources/components/` alongside `WardenKnocks.tsx` (already referenced as existing in `happy-ui-data-layer-map.md`, confirm current state vs this spec before building).
- Acceptance: a for-carlos item renders as a card matching the design's four fields; the death-pip greys out within ~60-80s of the warden's `ts` going stale, confirmed by killing the warden process and watching the client (no server restart needed — it's a client-side clock).
- Dependencies: none structurally (data already flows per the design doc).
- Parallelizable: yes.
- Lane: happy-dev.

**PR-31 — Warden Watchdog UI, Slice 2 (answer/ack affordance round-trip)**
- Scope: wire the card's answer/acknowledge/heal/snooze affordances to `POST` back through the warden's channel and write the decision onto the item (mirrors `humanQA[]` + `warden-decisions.jsonl` append, per the design's Slice 2).
- Files: same components as PR-30 + the API write-path (`apiWarden.ts` per `happy-ui-data-layer-map.md`'s existing `POST /v1/warden/answer`).
- Acceptance: answering a knock-card from the UI round-trips to `warden-decisions.jsonl` and the asking lane receives the routed answer; the card never re-gates attention once closed (a trailing note may show, but it doesn't re-alert).
- Dependencies: PR-30.
- Parallelizable: no.
- Lane: happy-dev.

**PR-32 — Resolve the desk identity-collision fence (upstream fix for "identity unverified")**
- Scope: per `happy-ui-data-layer-map.md`'s live finding — the desk row renders `identity unverified` because two session records claim the same `claudeSessionId`. Confirmed this is the UI fence working correctly (not a render bug) — the actual fix is de-duplicating the desk session record, tying to the same boot-resume re-register-on-resume work as PR-8/PR-11.
- Files: wherever desk session registration happens (same family as PR-8/PR-11's boot-resume fixes), not the renderer.
- Acceptance: after a clean boot-resume cycle, exactly one session record carries the desk's `claudeSessionId`; the desk row renders its real role, not `identity unverified`.
- Dependencies: PR-8, PR-11 (same root-cause family).
- Parallelizable: no — sequence with the boot-resume identity track.
- Lane: happy-dev.

---

## §4 SEQUENCING

### Phase -1 — decision, not code
- **PR-0** (reconcile the daily-driver surface) — fire this first/in-parallel-with-everything; only PR-1 actually blocks on its answer landing before merge.

### Phase 0 — immediate, fully parallel, zero cross-dependencies (worktree-friendly)
Ship these first; each is small, isolated, and independently reviewable. Good worktree fan-out set:
- **PR-1** (boot daily-driver surface) — unblocks PR-2, PR-19, PR-25/26's web-build relevance. Start the scaffolding in parallel with PR-0; confirm target before merge.
- **PR-12** (per-poll timeout in useHonestFeed) — highest-leverage single fix in the backlog; isolated function.
- **PR-15** (session label = role not cwd) — fully independent.
- **PR-16** (pane fork-backfill render fix) — fully independent.
- **PR-21** (reserve gauge card height) — fully independent.
- **PR-25** (wire Expo Atlas, baseline report) — fully independent, produces data for later phases.
- **PR-8** (re-register-on-resume) — independent of the watcher-singleton track.
- **PR-11** (boot-resume cwd-source fix) — independent.
- **PR-30** (Warden Watchdog Slice 1) — independent; data already flows per the design doc.

### Phase 1 — sequenced pairs (depend on Phase 0 landings)
- **PR-2** (webUIReach check) ← after PR-1.
- **PR-13 → PR-14** (online-dot reconciliation, then full verdict-derivation) ← after PR-12.
- **PR-22** (de-flicker data layer) ← alongside/after PR-12 (same file, sequence to avoid conflict).
- **PR-23** (stabilize consumer list) ← alongside PR-21.
- **PR-20** (FeedUnreachable shared height) ← after PR-21.
- **PR-19** (honest offline SW page) ← after PR-1.
- **PR-9** (name-based re-registration) ← conceptually paired with PR-8, independently shippable.
- **PR-26** (act on bundle findings) ← hard-blocked on PR-25.
- **PR-27** (generalize LOUD-guard to warden + disk-sentinel) ← after PR-12, same hook family.
- **PR-31** (Warden Watchdog Slice 2) ← after PR-30.
- **PR-32** (desk identity-collision fix) ← after PR-8 + PR-11 land (same root-cause family).

### Phase 2 — the survival/elevated track (warden-gate lane, Carlos+overseer gated, sequential by design)
This track has a strict order baked into the CHIP2 design itself — do not parallelize within it:
1. **PR-3** (waker singleton) → **PR-4** (watch + launcher singleton, shares PR-3's helper)
2. **PR-5** (CHIP2 Layer 1: launcher supervises watch) — explicitly ordered after the singleton fix per the design doc's own T1b-must-precede-L1 note.
3. **PR-6** (CHIP2 Layer 2: mutual beats)
4. **PR-7** (CHIP2 Layer 3: Scheduled Task backstop) — draft can start earlier, registration gated last.

### Phase 3 — depends on Phase 2 ground truth
- **PR-10** (escalation DESK rung) — benefits from PR-8's reap+respawn primitive; logically slots after Phase 2's singleton fixes are proven (a flapping launcher makes escalation-ladder testing noisy).
- **PR-24** (structural gauge-lift) — only reach for this if PR-21+22+23 don't fully kill thrash in a live dogfood; sequence last in the UI-leanness track deliberately.

### Phase 4 — diagnosis-gated, can start anytime but may re-scope
- **PR-17** (self-host usage forwarding) — STEP 1 (diagnosis) can run in Phase 0 in parallel; STEP 2's scope depends on STEP 1's finding (display-only bug vs. safety-critical auto-compact blindness) — do not commit to a fix shape before STEP 1 resolves the load-bearing unknown.
- **PR-18** (congress liveness honesty) — independent, low-risk, can land whenever a happy-dev cycle has room.

### Phase 5 — cross-repo-gated (waits on infra's congress-roster payload, not just this repo)
- **PR-28** (health-decomposition moodlets) and **PR-29** (directional-bottleneck light + words) both depend on infra landing `health{score,causes}` / `bottleneck{direction}` into the roster payload — a dependency OUTSIDE happy-dev's own repo. Scaffold the client-side render dark-safe (renders today's row when the field is absent, per the Phase 1 build-plan discipline) so these can merge ahead of the data and light up automatically once infra ships its half. Do not block this repo's other phases on these two.

### What does NOT parallelize, and why
- The three warden-survival processes (waker/watch/launcher) share one fix shape (named mutex) and one design doc (CHIP2) with an explicit build order — splitting these across uncoordinated worktrees risks two different mutex-helper implementations landing in conflict. Land PR-3 alone, merge, then fan out PR-4/5/6/7 from a single updated base.
- Anything touching `useHonestFeed.ts` (PR-12, PR-22, PR-27) should land as a tight sequential set, not parallel worktrees — same file/hook family, real merge-conflict risk.
- PR-25 → PR-26 is a hard data dependency; do not scope PR-26 speculatively.
- PR-30 → PR-31 (Watchdog slices) are explicitly sequenced by the design doc itself (Slice 1 before Slice 2 before Slice 3) — don't build the write-back affordance before the read-only render is live and tuned.
- PR-0 is a decision, not a worktree — don't spin an agent on it; it's a Carlos/overseer/loom conversation that PR-1 waits on.

---

## Sources consulted (brief)
- The congress's own documented vision (primary source for §1, per the coordinator's redirect): [`unified-surface-vision-2026-06-29.md`](../../../parthenogenesis/congress/unified-surface-vision-2026-06-29.md) (the posture map + one-line vision) · [`cockpit-input/_SYNTHESIS.md`](../../../parthenogenesis/congress/cockpit-input/_SYNTHESIS.md) (the unanimous §0 honesty-spine + cockpit requirements, 8 lanes) · [`cockpit-input/loom.md`](../../../parthenogenesis/congress/cockpit-input/loom.md) + [`grounding/loom.md`](../../../parthenogenesis/congress/grounding/loom.md) (the FEEL contract) · happy-dev's own corpus: [`01-lightweight-ui-and-brain-routing.md`](01-lightweight-ui-and-brain-routing.md) (Tauri shell, measured ~20× RAM win) · [`02-nights-watch-ux-input.md`](02-nights-watch-ux-input.md) / [`03-nights-watch-ux-audit.md`](03-nights-watch-ux-audit.md) (UX backlog, not folded into this PR list as it's session-scoped tactical work, not final-form) · [`warden-watchdog-ui-design.md`](warden-watchdog-ui-design.md) (approved-feel Watchdog spec) · [`happy-ui-data-layer-map.md`](happy-ui-data-layer-map.md) (runtime-verified data layer + the identity-collision live finding) · [`phase1-oversee-lane-tiles-scope.md`](phase1-oversee-lane-tiles-scope.md) + [`phase2-monitor-scaffold-plan.md`](phase2-monitor-scaffold-plan.md) (the build-plan this PR list extends).
- Windows named-mutex singleton: [The Misunderstood Mutex](https://odetocode.com/blogs/scott/archive/2004/08/20/the-misunderstood-mutex.aspx); [Single Instance WinForm App with Mutex](https://www.autoitconsulting.com/site/development/single-instance-winform-app-csharp-mutex-named-pipes/) — confirms the pattern this codebase already implements correctly in `floor-state.cjs` Tier B; PR-3/4 are a direct port, not new design.
- Honest liveness UI: [From Data To Decisions — Smashing Magazine](https://www.smashingmagazine.com/2025/09/ux-strategies-real-time-dashboards/); [How to Implement Health Check Design](https://oneuptime.com/blog/post/2026-01-30-health-check-design/view) — "stale data should look stale," exact-timestamp freshness indicators; matches the `useHonestFeed` design intent already coded, validates closing G13 (the timeout gap) as the correct next move rather than a redesign.
- Lean Expo/RN-web: [Expo Atlas bundle analysis](https://docs.expo.dev/guides/analyzing-bundles/); [Reduce RN bundle size 2026](https://reactnativerelay.com/article/reduce-react-native-app-size-expo-bundle-optimization-tree-shaking-atlas-2026) — Atlas is the 2026-standard tool (PR-25); react-native-web itself only adds ~30-40KB gzipped, so the 156-dep concern is about native-only deps leaking into the web bundle, not RN-web's own overhead.
