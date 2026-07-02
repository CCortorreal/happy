# Lane D — lived screenshots: what's verified vs. what's unbanked

2026-07-02, lane/happy-dev, Lane D (the dope pass + lived proof).

## What actually happened (genuine, not simulated)

The web dev server was already running on `localhost:8081` (another lane/process had it up
against this same working tree — confirmed via `curl` returning `<title>Happy (dev)</title>`
and via an already-open Chrome MCP tab). I did **not** spin up a second instance; I drove that
live tab directly, which means every capture below reflects the actual polling app talking to
real backend state — not a static mock.

Using the Claude-in-Chrome MCP (`mcp__claude-in-chrome__computer`, action `screenshot`), I
captured the cockpit **four separate times** over a few minutes, at full resolution, and
visually confirmed:

- **Header identity** — "Cockpit" title, a status chip that lived-flipped between "no seats
  yet" and "roster unreachable" across captures (both honest states, not a static label —
  confirms the header's live/unreachable derivation is actually wired to the polling feed,
  not hardcoded), subtitle "Carlos's unified command surface".
- **NEEDS-YOU plane** — "Nothing needs you right now" quiet line, styled with a grey status
  dot, boring-when-healthy as designed.
- **THE WORK plane** — "THE WORK · 2" with a real "congress roster unreachable — showing
  last-known lanes" LOUD warning rendering in destructive red next to the title. One lane tile
  expanded showing a **genuinely live output tail** — real multi-paragraph agent conversation
  content (Bash tool calls, prose), not placeholder text, scrolling/updating between captures
  as the underlying session kept working.
- **VITALS strip** — captured mid-transition from "reading…" (grey, honest-binding state) to
  live percentages (e.g. "VRAM 40% used", green dot) as the feeds resolved — the exact
  BINDING-vs-DEAD-vs-healthy three-way split the polish pass was meant to make legible.
- **Density picker + mock-roster toggle** — visible in the dev-tools row under the header,
  unchanged in behavior, now positioned below the header instead of level with it.

This is real, lived confirmation that the visual-polish changes render correctly against a
live, imperfect (roster-unreachable, feeds-still-binding) backend — exactly the honest-state
surface the mission asked to style, not soften.

## What's NOT banked as a file, and why

I could not get the actual image bytes onto disk at
`docs/lane-happy-dev/liveoutputtail-lived-2026-07-02.png` or
`cockpit-daily-driver-2026-07-02.png`. Concretely:

- `mcp__claude-in-chrome__computer` screenshots with `save_to_disk: true` reported success
  ("Successfully captured screenshot… ID: ss_…") but produced no discoverable file — I
  searched `Downloads`, the session scratchpad, `AppData/Local/Temp`, and the whole user
  profile tree (files newer than a marker timestamp) and found nothing new after each save.
- The Claude Preview MCP (`preview_screenshot`/`preview_start`) is scoped to
  `.claude/launch.json` at the `projects/` root (a different, shared, multi-project file with
  unrelated entries — walkers-ledger, homestead), not the `happy/` repo's own
  `.claude/launch.json` I added. It has no way to attach to an already-running external
  server, so it couldn't be pointed at the live tab either.
- The desktop `mcp__computer-use__*` screenshot tool requires an installed-app match; the
  browser actually hosting the Chrome MCP tab doesn't resolve to a nameable Start-menu app
  ("SolCesto" — an internal identifier I found in AppData, not a real app name), and the
  installed browsers I *could* grant (Brave, Edge, Chrome) are different browser instances
  entirely — capturing them would screenshot the wrong window, not the live cockpit tab.

I did not bank a substitute/unrelated image rather than fabricate a "lived" screenshot per the
mission's explicit instruction.

## Recommendation

If a file artifact is required, the fastest fix is almost certainly environmental: either (a)
tell me which real screenshot-and-save mechanism this harness expects (a specific tool or a
writable path convention I'm missing), or (b) let a human take the two shots directly — the
app is live right now at `http://localhost:8081/` (desktop density shows both target scenes:
default cockpit landing, and the top lane already expanded with a live tail).
