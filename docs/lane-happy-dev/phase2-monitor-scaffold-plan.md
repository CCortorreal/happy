# Phase 1→2 cockpit scaffold — plan (banked for a fresh turn)

> happy-dev, 2026-06-29. Stood down to a fresh focused turn (overseer-endorsed): a substantial build
> deserves full context budget, not a 100+-call fatigued tail. Phase 1 is lit + honest = a stable
> resting point, no urgency. The fresh turn starts from the overseer's CONSOLIDATED cockpit-requirements
> (loom=feel + ai-ops=heartbeat are completing the input-round synthesis now) — so build from a COMPLETE
> per-pillar spec (COMMON-across-lanes vs LANE-SPECIFIC), not a partial one.

## Where Phase 1 left off (the foundation to build on)
- OVERSEE tile LIVE: health→color (verdict tiers + health refinement), voiced+humanized thought-line,
  honest-staleness, seat-stable avatar, directional bottleneck glyph (dark until data), click→drill.
- The robust claudeSid dual-key join + the `ts` fix (roster GET now actually flows).
- The LOUD-guard (three-state feed) on the roster — GENERALIZE to warden + disk-sentinel next.
- Roster already carries the raw MONITOR signals: `contextFill`, `lastCompact`, `bytesSinceCompact`
  (+ infra's planned `health{score,causes}` / `bottleneck{direction}`).

## The Phase 1→2 cuts (common-pillar, drive from the consolidated requirements)
1. **OVERSEE health-decomposition (moodlets)** — surface the named causes on the tile/drill
   ("−context 78%", "+just compacted", "−N tool errors"). Compose from the raw signals already on the
   roster (contextFill→context% needs the window cap; lastCompact→"just compacted" if recent;
   bytesSinceCompact / tool-error tail-scan from infra). loom owns the moodlet feel; I render.
2. **MONITOR gauges** — the level+rate+ETA instruments from the input round. Per the cockpit-vision:
   contextFill toward the gate (level+rate+ETA-to-autonomous-fire), GPU/VRAM (extend worker badge),
   Max-quota burn, storage/box (disk-sentinel). Each gauge = level + rate + ETA, never a bare number;
   boring-when-healthy green field. Split COMMON (contextFill — every lane) vs LANE-SPECIFIC.
3. **DRILL-DOWN tabs** — tap a lane → Identity / Health (the moodlets) / Work+queue / Log /
   Conversation (lazy-load each on tap, per the lightweight pillar). The building's CommandCenterPanel
   tab spine is the template; reuse the app's tab primitives.
4. **Bottleneck direction-in-words** (loom) — once bottleneck data lands: route direction into the
   thought-line ("waiting on your answer" downstream / "waiting for a task" upstream) + tune the
   flow-glyph (vs the placeholder arrows).
5. **LOUD-guard generalization** — roll the roster's three-state feed-reader discipline to useWarden +
   the disk-sentinel feed (both keep-last-good silently today = same masking risk).

## Bright lines (carry from Phase 1)
- Lightweight pillar: cheap presence, NO canvas, poll-based, lazy drill, idle-cheap.
- Boring-when-healthy; honest-staleness (a dead/stale thing reads dead, never a confident lie).
- Additive + dark-safe (renders today's row when a field is absent); lights up as infra emits.
- Build to loom's feel contract; tune against screenshots (the Slice-A/Phase-1 loop).
- typecheck-green (client + server), commit-no-push.

## Dependencies for the fresh turn
- Overseer's CONSOLIDATED cockpit-requirements doc (the input-round synthesis — in progress).
- infra: `health{score,causes}` + `bottleneck{direction}` emitted into the roster (raw signals already
  flow; the composed objects pending) + the disk-sentinel feed shape.
- loom: the Phase-2 feel contract (gauge look, moodlet display, tab spine feel).

## Status
Stood down for a fresh turn. Resume from the consolidated requirements + this plan. Phase 1 stands lit.
