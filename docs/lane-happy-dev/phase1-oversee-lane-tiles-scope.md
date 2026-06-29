# Phase 1 — OVERSEE: the warm lane tile (scope)

> happy-dev, 2026-06-28. Converged with congress: overseer (priority), infra (data/oracle), loom (feel).
> Next swig after Phase 0 (Hearth seed) shipped + the durable Tauri daily-driver landed (Carlos
> up-and-in). Sources: `parthenogenesis/docs/hearth-cockpit-vision-2026-06-28.md` (roadmap) +
> `hearth-phase1-oversee-ux-2026-06-28.md` (loom's feel contract — build to it).

## The frame (the only justification that counts)

**How does this help Carlos SEE and steer his life-work through the congress?** — overseer's bright
line, not cockpit polish for its own sake. Phase 1 answers one glance: *of the lanes working on my
life, who's healthy, who's stuck (and which way), and what is each actually doing right now?* It
deepens the surface Carlos is **already watching** (the Hearthside list). If a treatment doesn't serve
that glance, it's out.

## Lean guardrails (overseer — Carlos corrected against over-building)

- **Deepen, don't add a surface.** The tile IS the enriched Hearthside row (one-zoom: the list *is*
  the tiles), not a parallel screen.
- **No auto-pipeline.** Phase 2 (MONITOR) + Phase 4 (COMMAND) stay HELD. After Phase 1 lands and
  Carlos *uses* it, reassess whether more cockpit earns the next cut or capacity goes elsewhere.
- **Lightweight pillar.** Cheap presence only — static avatar state-frames + unistyles tokens, **NO
  canvas / no Pixi floor** (fights Factorio + the brain's VRAM). Poll-based. Idle-cheap. Lazy drill.
- **Boring-when-healthy.** A calm green resting field Carlos can look away from; only what broke the
  pattern draws the eye.

## The cut — ONE warm-from-the-start tile (loom's design call)

Build-first-five #1 (the tile) and #5 (identity + thought-line warmth) are the **same artifact** — a
colored dot is a console; a face + a plain-language thought is the household. Building cold-then-warm
= building twice + a cold first impression. So Phase 1 = **tile (#1) + directional Bottleneck light
(#2) + identity/thought warmth (#5)**, warm from the start. (#3 alerts = done/mantel; #4
Electric-triad = Phase 2.)

Each enriched row/tile carries five things:

1. **Identity** — avatar + name; sub-identity session→`role · pedal`, worker→`model`. *(Build note:
   use the app's existing deterministic per-id `Avatar` keyed by seat — CLAUDE.md mandates it, and it
   satisfies loom's "stable one-face-per-agent" in-system, per her own "carry within Happy's design
   system, don't transplant" DNA. Open Q to loom below re: cast.ts.)*
2. **Health → color** (tile bg) — universal **green** (alive+healthy / calm resting) · **amber**
   (needs-attention: WEDGED / open for-carlos knock / degrading) · **red** (dead / hard incident) ·
   **grey** (DAEMON-LOST / idle-cold / never-booted — honest-not-alarming, distinct from red).
3. **Avatar = activity** — a cheap static **state-frame** (working / thinking / idle / blocked /
   stuck / dead). "The office IS the status" without animation.
4. **Thought-line** (the warmth) — one line, villager voice, present-continuous, **subjectless**
   ("drafting the i18n strings"). See voicing rules below.
5. **Directional Bottleneck light** — one glyph: **working** (flowing) · **blocked-downstream**
   (produced something, waiting on it consumed/answered — e.g. an open for-carlos knock, or a `--to`
   peer send with no reply) · **starved-upstream** (no input — idle / waiting on dep/quota). Fail-
   closed (unknown → grey, never false-green). One glance = fault + direction.

**Click → drill** (Phase 1 floor): tap → open the lane (session → conversation; worker → read-only).
The rich inspect-tabs (Identity/Health/Work/Log/Conversation) are **Phase 3**, not this cut.

## Data contract (infra ORACLE → my GET projection → render) — settled

Architecture line (locked): **oracle emits raw deterministic signals; the renderer voices them.** No
phrasing, no self-report in the substrate (loom superseded the self-report field — ground-truth-derived
is more honest and adds **no net-new substrate field**).

infra emits on each `congress-roster.json` seat (deploy-gated behind the re-register sweep, same
`claudeSid` join):
- `health: { score, causes: [{ sign, label, magnitude }] }` — score = weighted composite (infra
  weights), causes = moodlets (verdict + context% + compact-recency + near-free tool-error tail-scan).
- raw **thought signals** — `currentWork` (channel-derived, already flows for workers; generalize) +
  `lastAssistantText` (cheap transcript tail-scan) + `pedal`.
- `bottleneck: { direction, approximate: true }` — cheap channel heuristic; accurate seat-declared
  block-state is an **evidence-gated follow-up** only if the heuristic reads fuzzy.

My halves: project these through **GET /v1/congress/roster** (mirror existing roster fields) →
`CongressSeat` client type → the tile render + the voicing.

## Voicing rules (loom owns the words; I implement)

- **Source priority, fail-honest:** `currentWork` → a *clean* short `lastAssistantText` snippet (only
  if it reads as a clear present-tense activity) → `pedal` fallback. Better an honest pedal fallback
  than a confabulated distillation. Cheap heuristic extraction, **no per-tile model call**.
- **Voice:** present-continuous, active, subjectless; name the *thing* in human terms ("the ACL
  proposal"), never a tool call / task-id; ~3–7 words, ellipsis-truncate.
- **Honest-staleness (load-bearing):** render fresh ONLY while liveness-fresh; WEDGED/DEAD/stale →
  grey to **"(quiet — last: …)"**, never a frozen-fresh present-tense lie. Same discipline as the
  disk-sentinel `ts` / Warden pip / worker verdict-gating.

## Build plan (additive, dark-safe — proven pattern)

1. Client: extend `CongressSeat` with `health` / `bottleneck` / raw thought signals (nullish,
   dark-safe — renders today's row when absent).
2. GET projection: mirror the new fields in `congressRoutes.ts` (my lane).
3. Render: enrich the existing Hearthside rows (`Item`/`ItemGroup`, same poll path, verdict-over-
   `active` liveness) into tiles — health color, Avatar state-frame, voiced thought-line, bottleneck
   glyph, click→drill, causes-on-drill. Optional compact avatar header for fleet-glance (layout = my
   call).
4. Lights up when infra's oracle emits the fields (re-register sweep) — same wired-but-dark
   discipline as choices[]/commands[]; nothing blocks on the producer.

## Success test

Carlos glances and — without reading carefully — knows who's healthy, who's stuck and which way, and
what each lane is doing. Boring when healthy; the one tile that broke the pattern is where his eye
lands. If it takes scanning, it failed.

## Open questions (for loom — feel-owner's call)

1. **Avatar source:** use the app's existing deterministic `Avatar` (in-system, CLAUDE.md-mandated,
   matches your "don't transplant" DNA) vs porting `cast.ts` face-hash verbatim? Recommend Avatar.
2. **Color double-encoding:** health-bg uses red/amber/green (magnitude) and the bottleneck light uses
   green/yellow/red (direction) — same palette, two meanings on one tile, in tension with "one
   semantics everywhere." Propose the bottleneck be a directional **glyph (shape carries direction —
   ↓ downstream / ↑ upstream / grey unknown)** so it doesn't double-read against the health bg. Your call.

## Status
overseer ✅ priority+lean · infra ✅ data contract (field shapes incoming) · loom ✅ feel contract
(2 open Qs above) · happy-dev: build on bless, dark-safe, no push.
