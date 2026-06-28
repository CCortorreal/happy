# Nights Watch — UX audit of Carlos's daily surfaces

seat-f0d9f9 · 2026-06-27 overnight · PRIME #4 (UX-positioned)

Grounded read of the surfaces Carlos touches daily on the lightweight (Tauri/
WebView2) driver: **session view**, **header chrome**, **cost badge**,
**recent-sessions list**. Findings split into *staged live* (zero-risk, done
this watch) vs *proposed* (queued for his AM review — not done overnight because
they change behavior or carry layout-shift risk).

## ✅ Staged live this watch (typecheck-green, committed, NOT pushed)

1. **Recent-list page wrapped in `React.memo`** (`session/recent.tsx`). It was a
   bare `export default function` — violates the project rule "always wrap pages
   in memo" that every other page (e.g. `session/[id].tsx`) follows. Pure
   convention fix, no behavior change.
2. **Cost badge is now tappable → `/settings/usage`** (NW track-3). Natural
   drill-down: tap the cost number to see the cost breakdown. Additive
   affordance; flagged here as a new behavior at the session header.
3. **`tauri:build:selfhost` script** (NW track-1) — one-command self-host
   daily-driver rebuild (bakes the non-secret `PUBLIC_URL`).

## 🔍 Proposed (for Carlos's morning review — staged as proposals, not applied)

### P1 — Recent list `FlatList` → `FlashList` (performance)
`recent.tsx` uses plain RN `FlatList`; the codebase standardizes on
`@shopify/flash-list` (a dep already) for long lists. Session history grows
unbounded → FlashList is the right tool. Visually identical, but a swap carries
scroll/layout-shift risk, so I'm proposing rather than swapping live overnight.
*Effort: small-mechanical (add `estimatedItemSize`, swap import).*

### P2 — Per-session cost in the recent list (extends the cost prime)
The cost badge surfaces cost *inside* a session; the recent list shows none.
Add a compact cost figure to each session card's subtitle (same
`useSessionCost`/priced path → one cost truth). Carlos scans his session history
and sees what each cost — the cost prime, where he browses. *Effort: medium
(per-row cost fetch; consider a batched usage query to avoid N polls).*

### P3 — Cost badge: per-model breakdown on long-press
`useSessionCost` already returns `costByModel`. A long-press popover showing the
per-model split is a cheap, high-signal addition. *Effort: small.*

### P4 — Desktop hotkeys (the Tauri driver is web → `useGlobalKeyboard` is now
first-class on the daily surface)
`useGlobalKeyboard` is web-only; the daily driver *is* web, so keyboard-first
control is suddenly free. Propose a shortcut map: new session, switch session
(cmd/ctrl+[ / ]), focus input, open Usage. New hotkeys are a behavior change →
proposed, not wired overnight. *Effort: small-medium.*

### P5 — A total/at-a-glance cost surface across sessions
Cost is per-session today. A daily/weekly total on the recent-list header (or
home) gives Carlos the budget-at-a-glance the cost prime is really about.
Ties to the `budget-config.softCostUsd` thresholds the badge already mirrors.
*Effort: medium.*

### P6 — Session timestamps within a day (minor)
The recent list groups by date header but shows no time within a day. A small
relative time on each card (`time.minutesAgo` etc., already in i18n) aids
scanning. *Effort: small.*

## Notes
- All P-items are additive; none silently change a workflow Carlos relies on.
- P2/P5 are the highest-leverage for the cost prime; P1 is the cleanest pure win.
- Recommend Carlos approve P1 + P3 first (smallest, safest), then P2/P5.
