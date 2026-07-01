# The Work-First Cockpit — command-center reframe spec

> Fable-authored IA spec, 2026-07-01. Resolves PR-0 (daily-driver surface) per Carlos's call and defines the
> work-first reframe that makes Happy MEET the bar of "THE user interface where the work truly flows."
> Grounds on: [final-form-plan.md](final-form-plan.md) §1 vision + G10-G22 gaps, the congress
> `unified-surface-vision-2026-06-29.md`, loom's cockpit-v2 two-plane reframe (dev-route), the 8-lane
> cockpit-input synthesis (§0 honesty-spine + its no-spam twin), and the **munder building** as the
> work-first north-star (the Electron office where agents-as-sprites ARE the interface; "spawn one to see
> real Claude output stream in here"; the GOD→research/build/review fan-out; "fun to watch").

## 0. Carlos's lock (2026-07-01)

*"GO BIG OR GO HOME. THIS IS MULTI SURFACE. I DON'T THINK I CAN TAURI ON THE PHONE. TAURI NEEDS TO BE A
WINDOW INTO HAPPY, BUT EVERY DEVICE (PHONE, DECK) NEEDS THE SAME SYSTEM-AGNOSTIC SURFACE. THE FILES ARE
THE SELF. OWN THE SEAT, RENT THE BRAIN."*

## 1. PR-0 RESOLVED — the one surface

**One posture-adaptive Happy core, rendered on every device. No per-device fork.**

- The Happy app (Expo/React-Native core) is THE surface. It renders: **desktop** → a Tauri window (the
  lightweight ~20× shell) and/or `:8081` web; **phone** → the app/PWA; **Deck** → the app/PWA; **remote** →
  the same, projected. Every one is the SAME surface.
- **Tauri is a WINDOW INTO Happy** — a desktop container that loads the one web export. It is NOT a separate
  app, never a distinct codebase. (Tauri can't run on the phone; it was never meant to — it's the desktop
  pane onto the shared surface.)
- **Capability is posture-invariant; only default density/altitude varies.** The phone is the full cockpit at
  lower default density, not a crippled subset. Consequential-confirm gates (COST / GIT-push / DESTRUCTIVE)
  travel with the surface to every device — never dropped on a small screen.
- **The files are the self.** The surface is a device-agnostic *renderer* of state that lives in files
  (peer-channel `state/`, threads, congress feeds, the self-host server's projections). No device holds the
  self; the files do. Own the seat (the surface + continuity), rent the brain (the model).

This closes the final-form-plan §1 conflict flag: Tauri-vs-:8081 was a false fork — both are windows onto the
one core. The daily driver is *Happy*, wherever you open it.

## 2. THE INVERSION — work-first, not telemetry-first

Today's surface (verified firsthand 2026-07-01): the Terminals tab leads with a congress-status banner, warden
cards, and a full RTX-3090 VRAM gauge; the *sessions* — the work — sit below the fold; in wide mode the work
pane is a black void until you hand-pick a session. **The machine's health owns the seat the work should own.**

Flip it. The munder model: the WORK is the living visual center; health is ambient. The surface spine,
top-to-bottom, is three planes:

### Plane 1 — NEEDS-YOU (the interrupt)
Knock-cards, decisions, and gates that need Carlos — surfaced FIRST, as an interrupt above the work. This is
loom's "needs-you" plane. **Boring-when-healthy: when nothing needs him, this plane is silent** (a thin line,
not an empty labeled box). Consequential-confirm gates render here on every surface.

### Plane 2 — THE WORK (the living center, the default view)
The active lanes/sessions/agents as the main event — NOT a list under a gauge, but the living map of what is
flowing right now:
- **Per lane: the work-object, honest state, and motion.** Each active lane shows its current *work-object*
  (the thought-line names the specific thing — "sealing the cage net," never a bare "building"/"overseeing";
  the banned-gerund rule from `_SYNTHESIS.md` §1 holds), its honest state (idle / working / blocked / done —
  fail-honest, derived from a fresh probe, never a hard-coded green), and its motion (a live tail of the
  Claude output stream when expanded — the munder "spawn one to see real output stream in here").
- **The fan-out is visible.** When a dispatch is live (a conductor fanning to lanes — a workflow, an overseer
  delegation), the surface shows the GOD→lanes fan-out as the living structure, the way munder shows
  GOD→research/build/review. You watch the work move.
- **Default view is THIS.** No black void. Opening Happy lands on the work board — what's in flight — not on
  an empty pane awaiting a click.

### Plane 3 — VITALS (ambient telemetry)
VRAM / disk / heartbeat / context / backlog collapse into ONE compact vitals strip — a row of small dots + a
one-line summary each, **boring when healthy, expanding to the full gauge only when something is wrong AND
Carlos taps it.** Never the front-page real-estate hog it is today. The honesty-spine still governs: a dead
feed reads LOUD — but LOUD *in the vitals strip* (a red dot that draws the eye), not LOUD *taking over the
whole surface* (today's failure: two red banners pushing the work off-screen).

## 3. Posture-adaptive render (same three planes, altitude varies)

- **Desktop (Tauri window / :8081, full-steer):** dense. The work board with multiple lanes visible at once,
  terminals expandable inline, the fan-out drawn out, the vitals strip a quiet footer. The wall you drive from.
- **Phone (glance / approve):** the needs-you plane + a compact work board (one honest line per lane, tap to
  expand) + a collapsed vitals dot-row. Approve/steer with a tap; the confirm-gates travel here intact.
- **Deck (couch-pilot):** between desktop and phone — lean-back density, controller-reachable.
- **Loki (work):** the respected wall — firewalled, minimal, no congress internals.

Atoms built once (lane-tile, knock-card, vitals-dot, thought-line, fan-out-edge), composed per posture. This
is the unified-surface vision, made concrete.

## 4. Invariants that DON'T bend

- **§0 Honesty-spine:** every rendered state fails honest (three-state feed RENDER/QUIET/LOUD, never a
  confident green over a dead feed). This is why the reframe REQUIRES the trust-debt floor (§5).
- **The no-spam twin:** never TERMINALPOCALYPSE, signal not noise, boring-when-healthy. The living work is
  CALM when calm — the munder floor is "fun to watch" precisely because it's not a scrolling wall of noise.
- **Lean-by-construction:** reserved heights (no reflow on poll), stable refs, the measured-lightweight shell.

## 5. Prerequisite — the trust-debt floor (why it "doesn't meet it")

A work-first surface that still lies and flashes doesn't meet the bar either. These G-gaps are the floor and
fold into the reframe (mostly Sonnet-lane, root-caused in final-form-plan §2):
- **G10/G14 — liveness dot lies** (online + dead simultaneously) → derive the dot from the honest-feed probe.
- **G11 — session label = cwd, not role** (made Carlos archive the live overseer) → label = seat role.
- **G13 — honest-dead stalls on a hung backend** (no per-poll AbortController) → time-boxed poll, LOUD ≤12-15s.
- **G20 — gauges flash + reflow the list every 5s** (no reserved height, fresh refs each poll) → reserved
  card heights + stable refs.
- **G17/G18 — SW-503 masks the entire recovery window** → differentiated dead/recovering/binding states.

## 6. Build sequence (go big, but reviewable — never blind-cut Carlos's live surface)

1. **Slice 1 — the three-plane work-first cockpit in the dev-route** (`cockpit-v2.tsx`), rendering live data:
   needs-you / the-work / vitals-strip. Dogfooded via Chrome by the desk (loom's chair) before it touches the
   live surface. *Done-check: the dev route renders all three planes against live feeds; the work board is the
   default and shows honest per-lane state; screenshot-verified.*
2. **Slice 2 — fold in the trust-debt floor** (§5 G-gaps) so the reframe never lies/flashes. *Done-check: the
   liveness dot matches the honest feed; no reflow on poll (reserved heights); LOUD ≤15s on a killed feed.*
3. **Slice 3 — posture-adaptive density** (desktop dense / phone compact / Deck lean-back), same atoms. *Done-
   check: the same cockpit renders at three densities from one component set.*
4. **Slice 4 — cut to live**, Carlos-gated, with a live demo (loom's staged cutover gate, finally surfaced).

**Fable-swing (design taste):** the IA (this doc), the work-first render + thought-line copy, the fan-out
visualization, the posture-density calls. **Sonnet-lane (mechanical):** the trust-debt bug fixes, the
vitals-strip collapse, the data hooks, the reserved-height plumbing.

## 7. Open, surfaced (not decided here)
- **loom's card-model cutover gate** — loom locked a Carlos-gated cutover for the state-derived card model;
  Slice 4 is where it lands. Surface the demo to Carlos, don't cut blind.
- **The push posture** — lane/happy-dev is 24 commits deep, never pushed. Vesta/desktop deploy on push
  (Carlos-gated). The reframe slices commit local; the cut-to-live needs the push decision.
