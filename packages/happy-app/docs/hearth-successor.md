# Hearth — the successor design pass + a runnable slice

> Author: the desk (copilot seat), Carlos-directed, 2026-07-03.
> Status: **design-lead pass + a runnable vertical slice** on a dev route. Steal-list for the
> `unifying-surface` lane. Design commits, does **not** push (loom's norm).
> FEEL ownership stays with **loom**; happy-dev/infra build. This is a contribution, not a fork.

## What this is

An independent design pass at "the ultimate successor to the Happy UI," plus a real, typechecking
Expo/RN slice of its hero surfaces. It started from a full exploration of every current Happy surface
(shell, chat core, sessions/machines, the cockpit, the design system, onboarding/voice) and three
independent successor directions, synthesized into one spine.

It converged — independently — on the congress's own north star. That convergence is the useful
signal, not a coincidence to paper over:

- **Posture, not screen** is the unit (GLANCE / APPROVE / FULL-STEER) — matches
  `parthenogenesis/congress/unified-surface-vision-2026-06-29.md`.
- **One modular core, capability posture-invariant; only density/default-altitude vary** — same.
- **The honesty-spine (#170):** a not-done / broken / idle / stale / unverified thing must *look*
  that way; never a confident green. State lives in the dot; identity (the face) only drains to grey
  when confidently gone. Lifted directly from `cockpit/colors.ts` + `sync/liveness.ts`.
- **Knock-cards, thought-lines, lane-IS-a-session** — the same atoms loom specced
  (`hearth-card-model-from-munder-2026-06-29.md`, `thought-line-voice-spec-2026-06-29.md`,
  `unifying-surface-architecture-v2-2026-06-28.md`).

So the desk's contribution is **not another vision doc** (the canon has those and is design-only). It
is the thing the canon explicitly lacks: **running code** — a high-fidelity, honest, demo-fed slice
loom/happy-dev can steal from, plus a fully-interactive HTML prototype of the whole thing.

## The thesis (one line)

One home, one object graph: the phone answers **"what needs me"** and **"what was I doing"** in two
seconds, and a conversation is a calm drill-down off it — the same spine reshaping into the desktop
NOC by posture, not resize.

### Core moves
1. **One home stream** replaces the Cockpit-vs-`/sessions` dual homes and the misnamed social "Inbox."
   Fixed urgency order: Resume → Needs-You → The Work → Vitals → Relay.
2. **Continuity is a card** — a pinned ember Resume card reads the baton + pedal thread; the app
   finally knows where you left off. Renders honest-null (dead-when-stale), never reconstructed.
3. **The triage queue is the spine** — one worst-first stream of everything wanting a human;
   boring-when-healthy collapses to one calm line.
4. **One gesture Permission Sheet, app-wide** — green affirm / neutral scope / red deny, arm→confirm
   for anything destructive, the same grammar in the stream, the session, and a lock-screen push.
5. **The honesty-spine is the card grammar** — every card wears a 3px left-spine whose colour *is* the
   honest state, so the whole congress is legible in one peripheral glance.
6. **One ember accent** resolves Happy's palette schizophrenia (unused Material-3 violet vs grayscale
   vs stock-iOS-blue). Ember is continuity; it never recolours health.

## The honest-state contract this slice honors

Reused verbatim from the real modules — not re-guessed:

| verdict (`sync/liveness.ts`) | dot colour | identity (avatar) |
| --- | --- | --- |
| `alive` (+ not blocked-downstream) | GREEN `#34C759` | full colour |
| `alive` + blocked-downstream | AMBER `#FF9500` | full colour |
| `wedged` | AMBER `#FF9500` | full colour |
| `idle` | GREY `#8E8E93` | **full colour** (idle keeps its face) |
| `dead` | RED `#E5484D` | **dimmed** (`isDimmed`) |
| `unverified` | GREY `#8E8E93` | **dimmed** (`isDimmed`) |

Two corrections the native slice makes over the first HTML prototype, in the name of honesty:
- **Amber = wedged/blocked, not "high context."** `ai-ops` at 88% context is `alive` → **green dot**;
  its context *gauge* is amber. State (dot) and telemetry (gauge) are separate honest axes.
- **`idle` keeps its identity colour.** `chef` idle → grey dot but a full-colour avatar; only `dead`
  and `unverified` drain the face (`isDimmed`). `calliope` on an offline deck is `unverified` → grey
  dot **and** dimmed face.

Teal (`ACCENT_CAGE #3BA0AE`, enclosure) and lilac (`ACCENT_ROUTINE #9B7EDE`, a routine ask) stay
deliberately OUTSIDE the health vocabulary.

## Files

```
sources/hearth/hearthModel.ts        # view-model types + honest colour map + demoHearth() fixtures
sources/hearth/HearthComponents.tsx  # the card grammar: SpineCard, ResumeCard, NeedsYouCard,
                                     #   LaneCard, VitalsBlock, DigestLine, ThreadsView, PermissionSheet
sources/app/(app)/dev/hearth-v2.tsx  # the screen composing the phone stream + threads + sheet
```
Plus a launcher row in `dev/index.tsx` and a `Stack.Screen` registration in `(app)/_layout.tsx`.

## Run it

`pnpm start` (or `pnpm web`) → **Developer Tools → Hearth v2**. Try:
- tap the ember **Resume** card (jump) / its "3 open threads" (→ Continuity view);
- **Needs-You**: tap the red `aegis` gate → the Permission Sheet; **Approve** arms (3-count) →
  confirm → the gate collapses, count decrements, toast fires;
- tap a **lane**; open the **Vitals** chips (expand a bar in place); **fold** the quiet lanes; **FAB**.

## The integration seam (demo → live)

The slice is **presentational-real, demo-fed** — an honest boundary, not a mock UI. Every field on the
view-model is named to mirror the real substrate (a `HearthLane.verdict` is exactly
`deriveLiveness().verdict`; `id` is the stable session id / `claudeSid`; `thought` is the distilled
`voiceThought()` line). Going live is a **thin adapter, not a rewrite**:

```ts
// today (hearthModel.ts):
const model = demoHearth();
// live: replace with a store selector that maps { session, seat } → HearthModel,
//       calling deriveLiveness(seat, rosterUnreachable) per lane. Every component is unchanged.
```

## Deliberately NOT built here (and why)

- **The desktop 3-column NOC** already exists and is excellent (`cockpit/NocGrid.tsx`). The slice
  targets the *phone* posture — the part that most differs from what ships today. Posture-invariance
  means the same atoms compose into that NOC; no re-build needed.
- **Live sync wiring** — see the seam above; that's happy-dev's leg.
- **A shared `ember` theme token** — promoting ember into `theme.ts` (both `lightTheme` and
  `darkTheme`, since `darkTheme satisfies typeof lightTheme`) is a FEEL-lead call for **loom**, not the
  desk's to make unilaterally. The slice keeps ember a local const so it's non-invasive to the shared
  theme.
- **Sparklines** in the vitals gauges — the slice uses bars to stay dependency-safe; the real
  `VitalGaugeCard` already has sparklines.
- **i18n** — dev route, i18n-exempt by repo convention. A shipped Hearth backfills `t()`.

## Verification

`pnpm typecheck` → **clean (exit 0, zero errors)** against the full app. The slice reuses the real
`Avatar` / `StatusDot`, the real `cockpit/colors` + `isDimmed`, the real `Typography` / theme tokens,
and the real routing/modal conventions. The *visual* design is proven by the interactive HTML
prototype (same design, published as a Claude Artifact). A live Expo-web screenshot was skipped as
disproportionate for one authed dev route; boot it via the steps above to see it render.

## Substrate this converges with (loom's canon)

- `parthenogenesis` thread `unifying-surface` (loom, FEEL/design-lead)
- `parthenogenesis/congress/unified-surface-vision-2026-06-29.md` — postures + one modular core
- `parthenogenesis/docs/unifying-surface-architecture-v2-2026-06-28.md` — lane = session, claudeSid join
- `parthenogenesis/docs/hearth-card-model-from-munder-2026-06-29.md` — the card feel-contract
- `parthenogenesis/docs/thought-line-voice-spec-2026-06-29.md` — the distilled thought-line
- `cockpit/colors.ts`, `sync/liveness.ts` — the honesty-spine, imported not re-guessed
