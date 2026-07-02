# Cockpit dev-ops backlog

> The ticket board for the cockpit convergence workstream. Source of truth for the
> `/loop COCKPIT DEV-OPS` pedal. Findings come from the live-surface audit + the
> over-time instrumented observation on 2026-07-02 (lane/happy-dev, localhost:8081).
>
> **Status legend:** `OPEN` · `IN-PROGRESS` · `PR` (awaiting Carlos merge) · `DONE`
> **Every ticket's acceptance is verified OVER TIME** — instrument the live app,
> watch multiple poll cycles, confirm the fix holds. Initial-load green is not done.

## Ranking / sequence

- **P0 — keystone + bug storm** (nothing else is verifiable until these land): CKP-21, CKP-01, CKP-02, CKP-03, CKP-08
- **P1 — the dead half** (feeds + the detail surface a human actually lands in): CKP-04, CKP-05, CKP-06, CKP-07, CKP-22
- **P2 — readability redesign** (make it a command surface, not a dev tool): CKP-09, CKP-10, CKP-11, CKP-12, CKP-13, CKP-17
- **P3 — steerability** (grow the hands): CKP-18, CKP-19, CKP-20
- **P4 — polish**: CKP-14, CKP-15, CKP-16

---

## P0 — keystone + bug storm

### CKP-21 · Dev server runs under watch so fixes go live · `infra` · Major · DONE
**The keystone. Do this first — nothing below can be verified until it lands.**
> **DONE 2026-07-02 ~12:08.** Fix: projects-infra `57f53c7` — both launch paths
> (`workshop/happy-up.ps1` + staged `congress-console.mjs`) start the server under
> `tsx watch --clear-screen=false` (+ chip session added the missing `.env.selfhost`
> layer to the console path). Carlos executed the elevated restart (old pid 42812
> survived a window-close — it was orphaned from this morning's non-happy-up restart;
> killed via `taskkill /F /T` from the elevated prompt).
> **Acceptance evidence (over time):** edit #1 (banner marker) live on first poll,
> pid 45904→46460; edit #2 (revert) live **+4.3s** from file write, pid→48452;
> hold: 4 cycles × 12s, pid 48452 stable, root 200 throughout; EOL-restore reload
> → pid 36668 healthy. 4 reloads total, zero crash-loops, PGlite re-opened cleanly
> every time. Server-side tickets are now live-verifiable.
The `:3005` happy-server ran ~18h under `tsx` (no `--watch`) in an elevated console; every commit served stale code until a manual elevated restart. We got burned twice today.
- **Fix:** run the dev server under `tsx watch` (or the warden/a supervisor) so lane commits hot-reload. If a one-time elevated restart is needed to bring the watch-mode server up, that's Carlos's hands.
- **Accept:** make a trivial server edit, observe it live within ~5s with no manual restart. Confirmed over 2 edits.
- **Dep:** blocks live verification of every server-side ticket (CKP-01/02/03/04/22).

### CKP-01 · RELAY plane: schema mismatch · `bug` · Critical · DONE
> **DONE 2026-07-02 ~12:55 — Carlos blessed in place** (commits `f4d633e`+`5929a66`
> landed on lane/happy-dev via the wrong-repo branch slip, disposition: keep). Server
> sends the client wire shape ({ts, stale, items[{id, ts:epochMs, …}]}, djb2 content id
> doubles as merge-dedupe key). **Over-time evidence (231s window, instrumented live):**
> 0 relay parse errors ever (kanban control fired 86× — instrument proven), `RELAY · 50`
> rendered + held, never unreachable, no dev toast. Stayed green through two later 5-min
> windows (CKP-03 verification rode the same hook).
Server sends `{ ts: ISO-string, from, to, kind, excerpt }`; client `CongressRelayItemSchema` requires an `id` (absent) and a **numeric** `ts` (gets a string). Parse rejected → "can't reach the relay log" + climbing error toast.
- **Files:** `packages/happy-server/.../congressOpsRoutes.ts` (relay builder), `packages/happy-app/sources/sync/congressRelayTypes.ts`.
- **Fix:** server already computes `epochMs` — send that as `ts`; add `id` (hash of ts+from+excerpt).
- **Accept:** RELAY plane renders real entries; **0 relay parse errors over 3 min** of observation (currently ~12/min).

### CKP-02 · KANBAN chips: wrong entity, not just wrong shape · `bug`/`decision` · Critical · PR
Server keys counts by building **floor** (atlas, crew, spine…); cockpit lanes are congress **seats**. Even with shape fixed, floor-counts have no seat to attach to.
- **Decision (Carlos, 2026-07-02): GO BIG — option (b).** Floors are first-class.
- **Accept:** **0 kanban parse errors over 3 min**; chips render only where data legitimately maps.
> **PR ready 2026-07-02 ~13:20** — branch `fix/ckp-02-floors-section` @ `1d9e357` (stacked on
> CKP-03's branch). New FLOORS plane renders the building's boards (floor + chips + total +
> honest board-mtime age); seat lanes drop kanban entirely; server envelope matches the relay
> convention. **Evidence (213s window):** kanban errors **0** (was 86–124/window through the
> same hook), relay 0, other 0 — first fully-silent console of the day. `FLOORS · 5`
> (atlas/crew/hestia/main/spine, main 45m fresh w/ 87 tasks, others honestly 16–21d stale)
> the only rendered state.

### CKP-03 · Live-count decays 9→0 and pins at zero · `bug` · Critical · PR
> **PR ready 2026-07-02 ~12:50** — branch `fix/ckp-03-live-count-decay` @ `9c8ca8a`. Root
> confirmed: header counted `online` (turn-within-3-min fence) while tiles paint verdict
> tiers — quiet seats drained out of the headline. Now: count = presence (alive|idle|wedged),
> pulse = turn-fresh, one deriveLiveness call. + fixed always-false `active` raw-read.
> **Evidence:** mechanism proof on the real function (fence crossing: OLD 1→0, NEW holds);
> lived 5m17s: `0 of 12 live` == roster truth (0 present-tier post-restart), single state,
> relay regression green. **Residual:** populated-roster re-verify rides CKP-22 (see below).
On load the header reads "9 of 11 live"; within seconds it drains to **"0 of 11 live"** and holds flat there (500ms watcher: 12/12 reads `0/11`) while all 6 seats keep rendering. The reassuring headline number is a load-time artifact that expires.
- **Likely root:** liveness is beat-age based; seats age past threshold between oracle refreshes, so the count drains instead of refreshing — or header count and settled count use different derivations.
- **Fix:** trace the "N live" derivation + staleness window; reconcile with per-seat verdicts.
- **Accept:** observed over **5 min**, the live count reflects true seat liveness and does not drain to 0 while seats are present.

### CKP-08 · Raw parse errors surface as a user-facing toast · `bug` · Minor · PR
A red toast shows "Failed to parse congress relay res…" with a climbing count (the cumulative parse-error counter, ~24/min). Developer exception strings on the human surface.
- **Fix:** swallow parse failures to `console` only; the honest-state plane is the user-facing signal.
- **Accept:** no dev-error toasts on the surface over 3 min. (CKP-01/02 remove the source; this removes the leak.)
> **PR ready 2026-07-02 ~13:35** — branch `fix/ckp-08-feed-diagnostics` @ `ab82420` (stack:
> lane → CKP-03 → CKP-02 → CKP-08). The "toast" was LogBox surfacing `console.error`; new
> `feedDiagnostic()` (console.log, compact summary) applied to all 9 parse sites across the
> 8 polled honest feeds; one-shot user flows keep console.error deliberately. **Evidence
> (controlled fault injection, 168s arc):** fetch patched to feed relay garbage 95s →
> 17 quiet `[honest-feed]` diagnostics, 0 error-tier, no toast ever, plane held last-good;
> fault cleared → diagnostics stopped, feed recovered.

---

## P1 — the dead half

### CKP-04 · Vitals feeds never resolve (DISK/CTX/BKLG) · `bug` · Major · OPEN
Over 190s, only VRAM ever showed a value; DISK/CTX/BKLG oscillated `—` ↔ `reading…` forever. "reading…" is a permanent resting state, not transient binding.
- **Fix:** repair the three feeds, or mark them explicitly unavailable (not perpetual "reading…").
- **Accept:** each vital shows a real value within 30s of load, or an explicit "unavailable" — observed over 3 min.

### CKP-05 · Session chat loads backwards (top-anchored, full history, no virtualization) · `bug` · Major · OPEN
Instrumented: on load `scrollTop` stays **0**; nodes grow **155 → 1054** and height **27k → 140k px** in 43s, still growing, never bottom-anchors. A chat should open at the newest message and page older history upward.
- **Fix:** bottom-anchor on newest; lazy-page older upward; virtualize so load doesn't scale with session length.
- **Accept:** on load the chat rests at the newest message; scrollHeight stabilizes < 3s; no unbounded top-down growth — observed over time on a 1000+ message session.

### CKP-06 · `/sessions/index` is a dead route (cutover escape hatch 404s) · `bug` · Major · OPEN
Navigating to `/sessions/index` → "Unmatched Route, page could not be found." This is the route the hamburger's "Classic session list" links to and the daily-driver cutover (VISION check 8) promised.
- **Fix:** register the classic-list route correctly (Expo Router file placement).
- **Accept:** hamburger → classic list renders; `/sessions/index` resolves, not 404.

### CKP-07 · "Classic session list" icon is a blank glyph → dead route · `bug` · Minor · OPEN
Icon-only button, ionicons private-use codepoint renders as blank/tofu, and it leads to the CKP-06 dead page. Double-broken.
- **Fix:** correct glyph + a visible label; wire to the fixed route.
- **Accept:** button shows a real icon + label and navigates to a live list.

### CKP-22 · Oracle emits 2 anonymous `seat:null` rows · `infra` · Minor · OPEN
seats-oracle publishes 2 rows with `seat:null`; the server row-salvage drops them, so 2 live sessions are invisible and the "11" count is untrustworthy.
> **Evidence grew 2026-07-02 ~12:40 (post-restart):** now **6** `seat:null` UNREGISTERED
> rows, and a freshly-registered, demonstrably-alive seat (`e26c843d`, the desk) reads
> **DEAD** with `lastTextTs:null` — false-DEAD attribution on a live seat, same family as
> peer-channel `c8bc55e` (oracle EPERM false-DEAD). Every named seat post-restart reads
> DEAD/REBOUND/DAEMON-LOST despite live panes. Severity looks **Major**, not Minor — the
> whole roster is currently unattributable; CKP-03's populated-roster re-verify blocks on
> this. (Registration note: register stamped `cuid=null` — "cuid unresolvable, daemon
> down/churned?" — the claudeSid-keyed join may not be enough for the oracle's verify.)
- **Fix (upstream, peer-channel):** name-or-drop the null rows at the source.
- **Accept:** roster count matches real seats; no silent-dropped rows. Related: CKP-03, CKP-13.

---

## P2 — readability redesign

### CKP-09 · Desktop wastes ~60% of screen (phone-width column in a void) · `design` · Critical · OPEN
One ~640px column pinned left; the rest is empty. Phone posture is nearly identical — density changes row tightness, not layout.
- **Fix:** desktop earns its width — multi-column NOC (lanes grid + persistent VITALS/RELAY right rail + wide tail pane). Phone stays single-column.
- **Accept:** on a desktop viewport, content uses the width; lived-verified across a resize.

### CKP-10 · Sovereignty boundary is invisible · `design` · Critical · OPEN
Caged seats (`cage-mvf:*`) render identically to host seats. The product's whole thesis — sealed vs open — has no visual language.
- **Fix:** caged seats read as contained at a glance (sealed frame/tint/lock, grouped under `cage-root`); host seats read as open.
- **Accept:** a first-time viewer can point to "which seats are sealed" without reading labels.

### CKP-11 · Recursive tree barely reads as a tree · `design` · Major · OPEN
penthouse→floor-god→worker nests with ~16px indent, no connective structure.
- **Fix:** stronger indentation + connective rails or explicit enclosure grouping.
- **Accept:** depth/parentage is unambiguous at a glance.

### CKP-12 · Real seats have no identity avatars · `design` · Major · OPEN
Live seats render as generic grey squares; only the mock roster has colored avatars — the design exists, live data doesn't populate it.
- **Fix:** deterministic per-seat identity color/glyph seeded from seat id, shaped by role.
- **Accept:** seats are visually distinguishable without reading labels.

### CKP-13 · "N live" gives no way to see the dark seats · `design` · Major · OPEN
The count implies missing seats with no drill-in.
- **Fix:** list dark seats greyed with last-seen.
- **Accept:** "what's not running" is answerable from the surface. Related: CKP-03, CKP-22.

### CKP-17 · Session detail has "no character" (ungroomed classic view) · `design` · Major · OPEN
The session you land in from a lane is the unmodified classic Happy chat — none of the cockpit's identity, honest-state language, or density reaches it.
- **Fix:** groom the session detail surface to match the cockpit (after CKP-05 fixes its load).
- **Accept:** the detail view reads as part of the cockpit, not a different app.

---

## P3 — steerability (grow the hands)

### CKP-18 · Steer is buried; promote to an operator pane · `feat` · Critical · OPEN
Steer only appears inside an expanded lane as a thin line; halt is a weightless text button.
- **Fix:** selecting a lane opens an operator pane — steer as the main event (full-width input, clear send, tail directly above so you see the effect).
- **Accept:** steering a lane is a first-class action reachable in one interaction; over-time verify a steer round-trip lands in the tail.

### CKP-19 · Wire the operator rail — PA broadcast + floor boot/down UI · `feat` · Major · OPEN
PA broadcast and floor boot/down shipped as endpoints (audited, two-step, penthouse-protected) with **no human surface** — curl-only.
- **Fix:** an operator rail mirroring the building's control room: PA compose + per-floor boot/down with the arm→dry-run→confirm flow.
- **Accept:** a human can broadcast + boot/down from the cockpit; two-step confirm enforced in UI; penthouse never a down target; over-time verify a dry-run round-trip.

### CKP-20 · Halt affordance is too weak for a destructive action · `feat` · Minor · OPEN
Halt looks like a link next to steer.
- **Fix:** unmistakably destructive (red, guarded), visible two-step arm→confirm.
- **Accept:** halt cannot fire on a single tap; reads as dangerous.

---

## P4 — polish

### CKP-14 · Dev toggles leak into the production landing · `design` · Minor · OPEN
DESKTOP/DECK/PHONE/MOCK RECURSIVE ROSTER sit as primary tabs; "Mock roster" is a dev switch presented as a feature.
- **Fix:** auto-detect posture; gate the mock toggle behind `__DEV__`.
- **Accept:** a daily-driver never sees "mock"; posture adapts to viewport/input.

### CKP-15 · VITALS are text dots, not gauges · `design` · Minor · OPEN
- **Fix:** small bars/sparklines with an emphasized current value.
- **Accept:** vitals read peripherally at a glance. Related: CKP-04.

### CKP-16 · Density postures are shallow (desktop ≈ phone) · `design` · Minor · OPEN
- **Fix:** desktop is a genuinely different layout, not a re-densified column.
- **Accept:** desktop and phone are distinct layouts, not the same column at two tightnesses. Related: CKP-09.

---

## Ledger (append per PR merge)

- 2026-07-02 — Board created from the live audit + over-time instrumented observation. 22 tickets. Keystone = CKP-21 (server under watch). Nothing merged yet.
- 2026-07-02 ~12:08 — **CKP-21 DONE** (tick 1 of the /loop). infra `57f53c7` (tsx watch, both launch paths) + Carlos's elevated restart. Verified over time: 2 probe edits live ≤~5s (pid lineage 45904→46460→48452), 4-cycle hold stable, 4 reloads zero crash-loops. Keystone landed — the board below is now live-verifiable.
- 2026-07-02 ~12:55 — **CKP-01 DONE** (tick 2, Carlos-blessed). Relay speaks the client contract; 0 parse errors across 231s + two later 5-min windows. First fix to ride CKP-21's hot-reload (zero elevated hands). Process slip owned: commits landed on the lane via a wrong-repo branch; memory `git-ops-need-explicit-cd` banked.
- 2026-07-02 ~12:55 — **CKP-02 verdict (Carlos): GO BIG** — option (b), a dedicated floors section rendering the building's boards. In flight.
