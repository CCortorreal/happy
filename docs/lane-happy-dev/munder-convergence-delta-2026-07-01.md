# Happy ↔ Munder Building convergence delta — 2026-07-01

> Authored by Sonnet-lane fan-out workflow `wf_5442fe3e-a65` (253K tokens, 3 agents, ~9min), read
> and staged for the desk. Raw JSON at `munder-convergence-delta-2026-07-01.json`. This doc is
> the desk-usable synthesis — a durable ranked convergence surface, so the delta survives
> compactions and later sessions can grep it directly.

## Headline

The single highest-value next move is **absorbing the building's persistent xterm terminal pool +
PTY stream bridge into Happy** so LaneTile's expanded view actually STREAMS live Claude output —
closes the biggest work-first gap (spec §2 "spawn one to see real output stream in here") without
touching the Pixi scene fork.

## Direction confirmed (and made precise)

Happy ABSORBS the building's IA — the spec's PR-0 lock holds, and the inventory strengthens it
with a new reason: every load-bearing building atom (**persistent xterm pool, hive router, oracle,
closing-time, breaker precedence, boot-gate, envelope fan-out**) is a MECHANISM/PROTOCOL that can
be lifted independently of the Electron shell, while every Happy-only asset (**useHonestFeed, e2e
sync, congress-roster dual-key, posture-adaptive tree, warden knock-plane**) is strictly
multi-surface and cannot be reproduced in Electron. The two sides COMPLEMENT — Happy takes the
building's mechanisms, keeps its multi-surface primitives, and neither side loses their strongest
kit.

## The Pixi verdict — DEFER-AND-ABSTRACT (split)

- **IMMEDIATE (this convergence pass):** abstract the walking-scene metaphor into three
  cross-surface primitives that DO travel — the existing `WorkerFanout` avatar strip (shipped);
  a lightweight per-lane "inbound envelope" pulse ring on the avatar (new, cheap, works on
  RN+Web); a dispatch-ledger row inside the expanded LaneTile detail. Together = "the fan-out
  is visible" without a scene.
- **LATER (Slice 6+, after cutover):** reintroduce the full PixiJS walking scene as a
  Tauri-desktop-ONLY `office view` route — an optional second lens onto the same
  congress-roster + hive-message feed. Phone/deck never see it; desktop optionally opens it as
  a second surface. Preserves the "fun to watch" heart on the device where it belongs, without
  regressing the primary cockpit.
- **Rationale:** the walking scene's operability layer (click-to-select, hover-to-preview) is
  duplicative of tapping a LaneTile — delight, not capability. **Delight belongs behind the
  capability, not in front of it.**

## Ranked next moves

1. **Build `LiveOutputTail`** (persistent xterm on web/Tauri, plain scroll on phone) backed by
   a new `useLaneTail` hook streaming assistant messages from the sync engine. Largest visible
   §2 gap. Desk-designs, Sonnet-builds. **L-size.**
2. **DECIDE the push gate for `lane/happy-dev`** — 78 commits deep, no remote branch, deploys
   on push. Slice 4's terminal blocker. **Carlos-only call.**
3. **Ship the Slice-2 hygiene backfill batch** — `hasContent` predicate on
   useVram/useDisk/useHeartbeat + AbortController threading through useHonestFeed +
   VitalsStrip posture threading. Three small Sonnet-lane items closing acknowledged flags
   before cockpit-v2 becomes daily-driver. **S+S+M.**
4. **Absorb `AwarenessBeat` + monotonic-beat honesty spine** — React error-boundary at
   cockpit-v2 root that stops a beat on render-death so a wedged cockpit reads WEDGED from
   outside the process. Required-in-spirit before cutover. **M-size, desk-designs.**
5. **Build consequential-confirm knock-card variants (COST / GIT-push / DESTRUCTIVE)** —
   bright-lines must travel with the surface before the surface becomes daily-driver. Cannot
   swipe-dismiss; capability-invariant across densities. **M-size, desk-designs, Sonnet-builds.**

## Absorbable NOW (all 9 items, ranked)

| # | Item | Size | Who | Done-check |
|---|---|---|---|---|
| 1 | Persistent xterm pool + PTY stream bridge (LaneTile live output tail) | L | desk / Sonnet | Expand a LaneTile on desktop web → live Claude bytes stream; phone renders plain scroll; canShowTail no longer needs the fallback |
| 2 | Boring-when-healthy thought-line copy invariant | S | Sonnet | `voiceThought.ts` exports curated line pool + dev-only banned-gerund lint |
| 3 | AwarenessBeat error-boundary + monotonic-beat honesty spine | M | desk | Throwing inside NeedsYouPlane stops beat → useHeartbeat flips to WEDGED within 20s |
| 4 | `hasContent` predicate backfill for useVram/useDisk/useHeartbeat | S | Sonnet | Simulated empty-but-fresh payload after a good one → LOUD escalation |
| 5 | VitalsStrip posture threading (title/label/summary/dot-wrap) | S | Sonnet | DensityPicker rescales VITALS at all three widths |
| 6 | AbortController threading into useHonestFeed's fetch chain | M | Sonnet | Stalled fetch truly cancelled at 4s; useHonestFeed no longer races-and-ignores |
| 7 | CLOSING TIME graceful-shutdown protocol (mail-based, WIP-safe) | M | desk | Cockpit sends broadcast, tracks ACKs, surfaces progress as knock-card; teardown proceeds only after ACK-or-timeout |
| 8 | Breaker-precedence pin (constrained/stopped overrides hook-derived status) | S | Sonnet | Seat in breaker=constrained pins to 'looping' amber; kills working-flicker |
| 9 | Consequential-confirm knock-card variants (COST/GIT-push/DESTRUCTIVE) | M | desk | Gate cards render at all densities, cannot be 'Not now'-dismissed |

## Absorb BUT needs design (design-fork queue)

1. **Envelope fan-out visualization** — the paper-plane sprite pattern needs an abstraction
   fork (SVG/canvas overlay of short animated dispatch arrows? Or per-lane pulse ring on the
   receiving avatar? Or a text ledger row?). Building rides PixiJS with fixed pixel positions;
   Happy has no scene.
2. **Two-tier agent hierarchy** (assistant/Dwight enriches prompts before god). Absorbing the
   assistant tier means extending `CongressSeatSchema` with an explicit parent/role edge —
   ripples into roster, sync-engine, every downstream consumer.
3. **Hive on-disk routed mail** (outbox/inbox drain + act taxonomy
   request/inform/propose/query/agree/refuse/done). Requires server-side `/v1/hive/route`
   endpoint and a decision on adopting the act enum.
4. **Two-layer floor-state oracle** (claim.json + monotonic beat.json + 9 verdict enum).
   AwarenessBeat is absorbable now; the FULL oracle with 9 verdict states is a rethink of how
   remote seats prove liveness through Happy's server.
5. **Loopback PTY gateway / remote-transcript bridge** — the building's port+token bridge for
   cross-floor terminal streaming. Happy needs to decide: encrypted sync channel (e2e-preserving)
   vs separate transport. Ties directly to LiveOutputTail (open fork #3).

## DO NOT absorb

1. Full PixiJS `OfficeFloor` walking-avatar scene as **primary** surface — 1895 lines, unsafe-eval
   CSP shim, desktop-only tech. Shatters multi-surface invariant. (Defer-and-abstract per Pixi verdict.)
2. Dual-shell architecture (`App.tsx` + `CrewShell.tsx` picked at build time) — Happy's whole
   point post-Slice-3 is ONE tree at three densities. Build-time shell switch is a regression.
3. Electron-main-process primitives (Tier-B named-mutex holder child PowerShell, node-pty, WebGL
   xterm as PRIMARY surface). Windows/Electron-only. Happy consumes their outputs via server APIs
   but never runs them locally.
4. Demo/mock event loop (`mockEvents.ts` + `cth:demo-handoff`). Happy already has stronger
   discipline via useHonestFeed's three-state spine.
5. Full CrewShell M0..M8 milestone scaffolding (facilities panel, PA broadcast, morning report,
   2017-line shell). "Building runs itself" surface area, out of scope for work-first cockpit.
6. Copilot PWA at `main/copilot-pwa/` — Happy IS the phone-cockpit answer. (Study the god-reply
   bubble UX for LiveOutputTail's phone fallback, but the embedded PWA itself is superseded.)
7. `cth-hook.cjs` + `merged-ptu.cjs` bootstrap shim. Deep coupling to the hive-hook wire format.
   Happy should receive hive events via its own server API.

## Open forks for Carlos (blockers on the desk's autonomy)

1. **Push gate for `lane/happy-dev`** — 78 commits deep, no remote branch. Vesta/desktop deploy
   on push per spec §7. Slice 4 terminal blocker.
2. **Pixi posture** — DEFER-AND-ABSTRACT is the desk's recommendation. Alternatives: (a) absorb
   full scene as Tauri-only primary; (b) build a low-fi cross-surface scene from day one;
   (c) drop the scene entirely as delight-not-capability.
3. **Live-output-tail transport** — encrypted sync channel (preserves e2e, more work) vs
   separate server-mediated PTY-bridge transport (faster, weaker crypto story). Bright-line-
   adjacent (touches how "files are self" extends to a byte stream).
4. **Two-tier assistant/god hierarchy** — ship it as a schema change, or leave as building-only
   and let Happy render only the flat god+workers view?
5. **Where cockpit-v2 lives at cutover** — replace `SessionsList.tsx` default export vs land
   `CockpitV2` as `(app)/_layout.tsx` default landing surface. Also: what happens to
   SessionsList's browse chrome (date/project headers, archive toggle)?

## What this doc is NOT

This is a **desk-usable ranked delta**, not a build spec. Each absorbable item still needs a
short design pass before Sonnet fans out (especially the L / M items). Nine open forks + five
"needs-design" items = a real Slice 5-6-7 shape, not a single slice.

---

*Source workflow: `wf_5442fe3e-a65`, ~9min, 253K tokens. Raw JSON at
`munder-convergence-delta-2026-07-01.json`.*
