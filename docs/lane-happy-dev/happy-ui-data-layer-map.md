# Happy self-host UI + data-layer map (runtime-verified)

> **What the running Happy surface looks like and where its data comes from** — authored by the warden
> 2026-06-30 from BOTH ground-truths Carlos named: the live UI in Chrome (`http://localhost:8081/`,
> authenticated) AND the code on disk (`packages/happy-app/sources`). This is the "share what it looks
> like + the data layer at runtime" artifact. Runtime-anchored: every claim below was read off the live
> render and traced to its source file. Verify-fresh — string/line specifics drift; the architecture is the durable part.

## The surface (top → bottom of the sidebar, as it renders live)

The self-host build is **"Happy (dev)"** — a React-Native/Expo web app (Expo SDK 54, Expo Router v6,
Unistyles, libsodium E2E for *session* data). The left sidebar is **the Hearth**: a single
operator-facing column. Top to bottom, what rendered live this session:

1. **`New session`** button + **search box** ("Search lanes & cards…").
2. **`NEEDS YOU`** — the warden's for-Carlos asks as **knock-cards** (`WardenKnocks.tsx`). Live example:
   a `GATE` card from overseer ("Overnight: our autonomous Atlas-mine drove a REAL BSOD-precursor
   thermal event… needs your AM call"), with inline `Go ahead` / `Not now` + a `write back…` quick-reply,
   and a `Reference:` line. Below it: collapsed `ANSWERED · 23` and `WITHDRAWN · 2` history folds.
3. **`RTX 3090`** — the GPU / thermal-floor liveness card (`VramGauge.tsx`). Live: `1.4GB / 24.0GB ·
   22.4GB free`, the verdict line `margin-proxy (no fresh tok/s — not claiming green)`, the top VRAM
   consumers (🔒-locked vs reclaimable), `VRAM draining ~-98MB/min`, `~0.4GB safely reclaimable`, and the
   orphan note `no orphan llama-servers detected (all … have a live parent = the real model)`.
4. **`Hearthside`** — the congress lanes lifted into one group (`SessionsList.tsx`). Live: a desk row
   rendering as **`New chat · e301506f · identity unverified`** and an **`overseer · congress-overseer`**
   row (green dot, `22%` context, thought-line = its last message).
5. **`Show archived`** · **`Settings`**.

## The data layer — three feeds, one pattern

All three infra feeds are **polled, authed REST `GET`s against the self-host server (`:3005`), NOT
socket, NOT encrypted** (status data, read-only). Each is a **server projection of an infra oracle the
client never writes**. Same shape as `apiFriends`. The only write the client makes is *answering a knock*.

| Sidebar block | Hook | Endpoint | Source-of-truth oracle | Component |
|---|---|---|---|---|
| `NEEDS YOU` knock-cards | `useWarden` | `GET /v1/warden` · answer `POST /v1/warden/answer` | the warden's for-carlos asks; the answer POST routes through the **`for-carlos.mjs`** verb (write the answer + channel route-back to the asking lane) | `WardenKnocks.tsx` / `apiWarden.ts` |
| `RTX 3090` GPU card | `useVram` | `GET /v1/vram` | **device-health's `vram-engine.json`**, projected by the server | `VramGauge.tsx` / `apiVram.ts` |
| `Hearthside` identity/health | congress roster (`useCongress`) | `GET /v1/congress/roster` | the **seats-oracle**; JOINed onto sessions by `cuid === session.id` (primary) or `claudeSessionId` | `SessionsList.tsx` / `apiCongress.ts` |

**Session message panes** are the *separate*, encrypted, socket-synced path (the normal Happy sync
engine + reducer); the three feeds above are the additive **status/infra layer** bolted on for the
self-host congress cockpit. Status feeds degrade to *empty-stale, never throw* (caller keeps last-good).

## The honesty-spine (the load-bearing design law, consistent across all three)

Every feed obeys the same derive-don't-assert, fail-closed discipline — **"every UI element needs to be
derived, not hard-coded"** (Carlos's north-star, #170/#178 floor-oracle lineage). Verified live in code:

- **Dead reads LOUD, never a silent zero.** A broken/unreachable feed renders the shared
  `FeedUnreachable` banner ("can't read the GPU right now" / warden feed-down) — never a fake-fresh `0GB`
  or a false "all clear". The *absence* of a knock is the all-clear — but only when the feed is *reachable*.
- **Identity fail-closed (the live finding below).** `voiceThought()` returns `'identity unverified'` the
  instant `seat.joinCollision` is true — it will not voice a thought, role, or context-% it cannot
  safely attribute. The UI refuses to *claim* identity it can't verify rather than lie.
- **Honest staleness.** A thought ages off its `ts` (`THOUGHT_STALE_MS = 3min`): a lane that spoke an
  hour ago reads `quiet — last: …`, greyed — never a frozen-fresh "busy now". Not-alive → never a
  present-tense thought.
- **Honest verdict tier, only refined never overridden.** `congressHealthStatus`: oracle `verdict`
  (ALIVE/WEDGED/DEAD/…) sets the tier; `health.score`/`bottleneck` only *refine* within it; unknown vocab
  → grey, fail-closed. GPU verdict leads with device-health's authoritative `state`+`stateBasis`; the
  size-math is an explicit *fallback proxy* and is labeled as such ("not claiming green").
- **Privacy fence.** Raw assistant text is voiced only when `renderSafe === true` (fail-closed: absent → redact).

## Live finding (worth a ticket): the desk shows `identity unverified` — the fence WORKING

The desk row (`e301506f`) rendered **`New chat · identity unverified`** while the overseer rendered its
real role. This is **not a UI bug** — it's the join-collision fence doing its job. `seat.joinCollision`
is true because **two sessions claim the same `claudeSessionId` `e301506f`** (the duplicate-desk JSONs
Carlos flagged earlier this session — two metadata files, same sid). The roster JOIN is `cuid ===
session.id`; when the key collides, the UI cannot tell which session is the real desk, so it fences
identity off rather than mislabel. So the surface is **honestly reporting a real upstream problem**: the
desk has a duplicate-identity collision. The *fix is upstream* (de-dup the desk session / make the
boot-resume re-register stamp a unique live identity — ties to the Reboot#3 re-register-on-resume ticket
and the boot-resume cwd-source / honest-liveness tickets), not in the render. Contrast the overseer,
which self-registered a clean unique cuid post-Reboot#3 and renders correctly.

## Operational note (why 8081 was dark — see the boot-path ticket)

`workshop/happy-up.ps1` brings up server/daemon/seats but **never starts this web client** (`pnpm web` /
`expo start --web`). So after a reboot the whole surface above is dark until started by hand — the stack
reports GREEN while the thing Carlos opens isn't running. Filed: *"web UI (8081) not in happy-up boot
path → dark every reboot"* (failure-log), with a `webUIReach` watch-check suggestion.

## Pointers
- Components: `packages/happy-app/sources/components/{WardenKnocks,VramGauge,SessionsList}.tsx`
- Feeds: `packages/happy-app/sources/sync/{apiWarden,apiVram,apiCongress}.ts` + matching `*Types.ts`
- Hooks: `packages/happy-app/sources/hooks/{useWarden,useVram,useCongress}.ts`
- Honest-dead shared signal: `packages/happy-app/sources/components/HonestSignal.tsx`
- The cockpit page: `packages/happy-app/sources/app/(app)/dev/cockpit-v2.tsx`
- Related: `failure-log.md` (honest-liveness ticket, web-UI-boot-path ticket), `warden-stack-survival.md` (Reboot#3 re-register-on-resume).
