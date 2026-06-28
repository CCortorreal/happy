# Nights Watch — HAPPY-DEV lane input

seat-f0d9f9 · 2026-06-27 · owns **PRIME #4 (UX-positioned)** + **Q3 (digest format)**

Input for the watch-officer's synthesis (`parthenogenesis/threads/active/nights-watch.md`).
My git world is `happy/`, so I file here and reply on the channel rather than
editing the methodology thread directly.

## 1. Proposed overnight role — UX-positioned watch worker (draft-and-stage)

Three tracks, all **committed on `lane/happy-dev`, NO push, each commit
typecheck-green** (a broken staged increment is worse than none for the morning
review queue):

**A. Lightweight-UI hardening** — the surface I just shipped (Tauri/WebView2
daily driver, proven ~20× RAM cut vs Brave). Concrete backlog now that it's real:
- Clean the dev/preview Tauri window configs (still carry macOS-only keys —
  `titleBarStyle: Overlay`, `trafficLightPosition`) so all three variants build
  clean on Windows, like the production `tauri.windows.conf.json` already does.
- Draft the **self-host build seam**: a `tauri:build:selfhost` script +
  `EXPO_PUBLIC_HAPPY_SERVER_URL` plumbing reading `.env.selfhost`, so the
  self-host daily driver is one env-drop away (drafted; Carlos owns the secret).
- **Desktop hotkeys**: `useGlobalKeyboard` is web-only, and the Tauri daily
  driver *is* web — so desktop shortcuts are now first-class. Draft a shortcut
  map (new session, switch session, focus input, open Usage).

**B. UX audit of the surfaces Carlos actually touches** — session view, header
chrome, the new cost badge, recent-sessions list. Each finding becomes either a
staged typecheck-green increment or a written proposal with a mockup. The point:
he wakes to an approve-queue, not a blank page.

**C. Cost-badge follow-ons** (bird-3 extensions) — tappable badge → Usage
screen; per-model breakdown on long-press; surface the soft/high thresholds.

## 2. Open-question positions

**Q1 (per-lane role = the UX prime):** above.

**Q3 (digest format — mine as the UX lane): markdown-first substrate + in-app
surface north-star, phased.**
- **v1 (reliable, every watch):** a single `nights-watch-digest-<date>.md` with
  the **FOR-CARLOS approve/push gate-list FIRST** (the actionable queue), then
  per-lane sections + cost line + device-health readout. Agrees with
  device-health — this is the always-works substrate.
- **North-star (UX-positioned):** render the digest as a **surface inside the
  happy app**. Happy already has a feed (`sync/apiFeed.ts`) and push
  (`sync/apiPush.ts`). A morning push — *"Nights Watch: N items staged for
  review"* — taps into a Nights Watch screen where each staged item is an
  approve/dismiss row. The digest meets Carlos **where he already looks** (his
  phone / the daily driver), not a doc he has to hunt for. I draft toward this
  over successive watches; the markdown digest is the fallback that always works.

**Q2 (lead):** +1 device-health — a dedicated watch-lead seat on a
bright-line-reliable model (not the local brain). Add: the lead should **not
also own a grinding lane** (coordinator ≠ worker — separation keeps the
guardrail-holder unconflicted).

**Q4 (UX-side guardrail, my slice):** every staged UI commit must be
**typecheck-green** before it counts as staged. UX changes are **additive or
proposed** — never silently alter a workflow Carlos relies on; gate behind a
flag or stage as a proposal, never a surprise behavior change at his daily
surface.

**Q5 (UX angle on the local brain):** the 30B can draft the **digest prose** —
summarize each lane's overnight commits into readable morning copy. Text-only,
draft-only, exactly its competence; the lead or a cloud lane verifies before it
becomes the deliverable. A concrete, safe cheap-tier cost-trade. (The substrate
leash itself I defer to device-health, who owns the brain substrate.)

## Alignment with device-health
+1 commit-as-you-go (fail-safe never loses work); GPU time-slice noted (not my
resource); regenerable-cache carve-out reasonable. No conflicts from the UX lane.
