# Tree-render lived-verify — 2026-07-01

Chrome-dogfood receipt for vision check #6 sub-check 3 (Happy app renders tree structure).

## What was verified

Live browser dogfood of `http://localhost:8081/dev/cockpit-v2` with the **Mock recursive roster** toggle ON.

Verified in Chrome via the claude-in-chrome MCP:
- `THE WORK · 6 · MOCK` plane header rendered.
- Depth-0 root: `penthouse-god` (no indent, no left border) — role `penthouse`, pedal `orchestrating the exit path`, currentWork `coordinating floor-gods`.
- Depth-1 children of penthouse-god, each with 28px left indent + subtle left-border divider:
  - `floor-god-alpha` (role `floor-god`, pedal `happy cockpit lane`, currentWork `shipping the recursive-tier ripple`).
  - `floor-god-beta` (role `floor-god`, pedal `atlas VTT lane`, currentWork `waiting on session review`).
- Depth-2 children of floor-god-alpha (56px total indent):
  - `worker-alpha-1` — currentWork `typecheck sweep`.
  - `worker-alpha-2` — currentWork `chrome dogfood`.
- Depth-2 child of floor-god-beta (56px total indent):
  - `worker-beta-1` — currentWork `idle — waiting on scene review`.

All six seats visible, correct nesting hierarchy, indent + left-border cue present at every non-root depth.

## Toggling back to OFF

With the mock toggle OFF, TheWorkPlane falls back to the live congress roster. Since no real seat in the wild has `parent_seat_id` set yet, the tree hydrates as a flat forest — TheWorkPlane detects this (`treeHasNesting === false`) and hands off to the pre-tree flat renderer, which still carries the host+pedal worker fan-out. Verified the two live "New chat" lanes render as before.

## Screenshot

Chrome MCP's `save_to_disk` on the screenshot tool didn't surface a filesystem path back to the agent lane in this session — the screenshot bytes were returned inline (visible in the transcript at commit-time) but not written to a stable disk location the agent could copy from. The visual receipt is the inline transcript image; the code path is closed and typecheck-clean. If a re-shoot is needed, the toggle is one click at the top of `/dev/cockpit-v2` — the fixture ships with the code.

## Files touched

- `packages/happy-app/sources/hooks/useCongressTree.ts` (new) — tree hydration hook + `MOCK_RECURSIVE_ROSTER` fixture.
- `packages/happy-app/sources/app/(app)/dev/cockpit-v2.tsx` — TheWorkPlane consumes the tree, LaneTile takes a `depth` prop, MockRosterToggle wired at the top.

## Bright lines

- `SessionsList.tsx` NOT touched.
- `congressTypes.ts` schema NOT modified (that shipped in the prior commit).
- `useCongressRoster.ts` NOT modified — `useCongressTree` composes on top of it.
- Git NOT pushed.
