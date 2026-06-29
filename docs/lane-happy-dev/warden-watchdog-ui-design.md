# Warden Watchdog UI — design spec (happy-dev)

> Approved-feel 2026-06-28 (Carlos: "the feel lands"). Built inside the Happy app.
> Source DNA: the munder/building soul brief (office-of-robots; *relate, don't report*).
> Data sources (Warden-owned, already built, no schema changes): `~/.happy-selfhost/warden-status.json` + `for-carlos.json` + `warden-escalations.jsonl`.

## The one principle

**A dashboard reports; this surface relates.** It is not a monitor — it is the Warden, a
member of the night shift who keeps the lights on, *reaching out* to Carlos. Carlos is a
peer the office works around, not an admin staring at gauges. Character lives in the **copy**,
not a cartoon persona; understated and warm.

## The four states

### 1. Quiet presence (the default — green)
When `warden-status.overall === "green"` and `for-carlos.json` is empty: **render almost
nothing.** A small, calm line — *"lights on — quiet night 🌿"* — and the honest-death pip.
Zero chrome, never a wall of green checkmarks, never steals focus. (munder's #1 rule: the
absence of a knock *is* the all-clear.)

### 2. The knock (a for-carlos ask)
Each `for-carlos.json` item renders as a **card that reads like a note a person left**, built
from `{from, q, ctx, ref}`:
- **from** → the sender line ("The Warden"), with its face/accent.
- **q** → the ask, in plain language, as the card title/body — the *question*, not a code.
- **ctx** → the *why* + the **cascade**: what is stuck behind Carlos's answer (e.g. "the waker's
  down — that's what's cut my link to the overseer"). Surface the downstream-blocked chain the
  way munder's Ask-Me shows stuck tasks, so "why isn't X working" reads as "ah, because I owe an
  answer here."
- **ref** → a quiet link/handle to the underlying thing (component, log line, session).
- **Affordance:** answer / acknowledge / heal / snooze — *on the card*. Answering routes back via
  the Warden's channel AND **writes the decision onto the item** (mirror munder `humanQA[]` +
  append `warden-decisions.jsonl`). Decisions live with the thing they decided, forever.
- **Manners (load-bearing):** never modal, never auto-select, never steal focus. Red left-edge =
  incident; lilac left-edge = needs-your-call. A closed ask with a trailing optional note stays
  visible but never re-gates attention (munder's "done card never re-gates").

### 3. The honest-death pip
A single liveness pip that is green **only while the Warden's own loop is genuinely alive**, and
**decays to grey by itself if ticks stop** (self-aging on a local clock — never a frozen-fresh
lie). This is munder's `AwarenessStrip` honest-death organ turned on the Warden itself: a dead
watchdog must *look* dead.

**Mechanism (Warden-confirmed 2026-06-28, no new field):** `warden-status.json` carries `ts` =
the watch loop's last write time. The watch loop polls every ~20s, so the pip ages from
`now() - ts`: **green/fresh < 60s, greying 60s–stale, grey/dead at > 60s** (3 missed 20s beats =
dead loop). The client computes this on its OWN local clock each poll — it must not trust a "I'm
alive" flag in the file; absence of a fresh `ts` *is* the death signal. Copy on grey: a quiet
"the Warden went quiet — last seen <t>".

### 4. The night report (the greeting)
On open, a quiet strip that **answers "how did the night go?" before it's asked** — collapsed to
date + flag-count ("quiet night" vs "2 flags"), flags inline, full brief on "read", dismiss
persists until a newer one lands. Drive from `warden-escalations.jsonl` history + last `overall`.
Peer-to-peer, then it gets out of the way.

## The watched floor (warden-status checks)
`checks: { server, daemon, waker, overseerReach:{status,detail} }` render as the **floor the
Warden watches** — each check a small named status window, the `detail` string as the
human-readable line. Quiet/calm when up; **LOUD (dashed red) only when down**. The stack is the
office; the checks are its rooms.

## Build discipline (carried from munder's renderer)
- **Poll, read-only, defensive.** Both files are script-written and re-read on a timer →
  normalize/default every field at the read boundary; **keep last good** on a parse/IO failure.
- **Stable content-hashed ids** across polls so cards don't remount/flicker (munder `stableId`).
- **Client never writes the queue** — it can only answer/dismiss; the Warden owns the files.
- Aesthetic: carry munder's warmth (warm surfaces, ink-not-black, named accents, restraint ≤ a
  few colors) **within Happy's existing design system** — fit the app, don't transplant a theme.

## Slices
1. **Slice 1 (first visible):** quiet-presence + the knock-card list (render for-carlos asks) +
   the honest-death pip. Read-only.
2. **Slice 2:** answer/ack affordance round-trip (write-back + channel route).
3. **Slice 3:** the watched-floor checks + the night-report greeting.

## Open (filled by the integration map)
- Where the pane lives in the Happy client + the data path (poll endpoint vs socket push).
- The server-side exposure of the two `~/.happy-selfhost/` files (auth/encryption boundary).
