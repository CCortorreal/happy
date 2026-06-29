# happy-dev failure-log

> The **shared failure-log both lanes read**, per [warden-design-2026-06-28.md](../../../parthenogenesis/docs/warden-design-2026-06-28.md).
> The loop: the **Warden** (OUTSIDE) heals a live failure to keep the stack alive *now*, then files a ticket here; **happy-dev** (INSIDE) fixes the root cause so it *can't recur*. The inside seat (overseer / copilot) also files defects found from inside. Every healed failure becomes a hardening ticket → failure modes driven toward zero. That convergence is what "unfuckupable" actually means.
>
> Status legend: 🔴 open · 🟡 in progress · ✅ landed

## Backfill — prior tickets (filed as prose 2026-06-28; expand on pickup)

- 🔴 **congress-console boots the server on `.env.dev` only** → would re-introduce the public-default master secret. Source: [2026-06-28 recovery handoff](../../../parthenogenesis/docs/handoffs/2026-06-28-happy-recovery-cleanslate-warden.md).
- 🔴 **Logout blocked when offline/401** → you can't log out to recover; logout must be local-only, never gated on a server call. Source: same handoff.

---

## 🔴 self-host context meter data-starved

copilot-drafted · 2026-06-28 · lane: happy-dev (INSIDE) · source: Warden heal→ticket loop

### Symptom
On the **self-host** stack, the in-chat context-window meter never renders, even with Settings → Appearance → **"Always Show Context Size" toggled ON**. The session header shows the **$ cost** figure (e.g. `$1.41`) but no context-% readout. By contrast, Claude Desktop (CC inside) shows the real gauge: *"Context left until auto-compact: 12%"*. Carlos is forced to `/compact` blind from Happy.

### Root cause
The display chain is intact; the **data source is empty on self-host.** `contextSize` is only computed in `processUsageData` (`packages/happy-app/sources/sync/reducer/reducer.ts:1150-1161`) from a CC **`usage` event** (`input_tokens` + `cache_creation_input_tokens` + `cache_read_input_tokens`). On the self-host path that usage payload isn't reaching the reducer (or arrives without those fields), so `latestUsage`/`usageData.contextSize` stays null/0. The render gate at **`packages/happy-app/sources/components/AgentInput.tsx:600`** (`props.usageData?.contextSize ? getContextWarning(...) : null`) then short-circuits to `null` *before* `getContextWarning` ever runs — so the `alwaysShowContextSize` toggle is dead code when there's no usage data. **Data starvation, not a display gate.**

### Severity escalation — this may also gate harness AUTO-COMPACTION
This is **not just a display bug.** Claude Code's auto-compact fires off the **same** API-response `usage` accounting (`input_tokens` + `cache_*`; schema `happy-cli/src/claude/types.ts:9`, all `.optional()`). If the self-host path doesn't populate `usage`, the harness has no token signal → the auto-compact countdown never advances → **the seat may never auto-trim and hits a hard context wall with no warning.** So STEP 2 below heals BOTH the meter (display) AND auto-compaction (safety) in one move — that's the real stakes.
- **LOAD-BEARING UNKNOWN (resolve before estimating severity):** does CC fall back to *local* tokenization when the server omits `usage`? Some harnesses estimate locally as a backstop. If CC does, the seat is safe and this stays a display-only bug. If it does NOT, the seat is genuinely blind. Resolve via: (i) check whether the self-host server returns a `usage` block, or (ii) observe whether the context countdown actually advances on a self-host seat (frozen countdown = blind harness), or (iii) a claude-code-guide check on CC's local-tokenization fallback.

### Fix — diagnosis-first
- **STEP 1 (confirm the gap):** instrument the usage-forwarding path for a self-host session — does a `usage` event with `input_tokens`/`cache_*` reach `processUsageData`? Look in `packages/happy-cli/src/claude/*` (the CC stream → session forwarding) **and** the self-host server's message relay. Two likely culprits: (i) the self-host server doesn't forward/relay the usage event the cloud path emits; (ii) the self-host model's usage shape differs and the fields land elsewhere / are absent.
- **STEP 2 (fix at source):** forward the usage payload on the self-host path exactly as the cloud path does, so `latestUsage.contextSize` populates. The UI then lights up with **zero display-side change** (the wiring already exists).

### Defensive nit (ship alongside)
`AgentInput.tsx:600` guards with a truthy `?` on a numeric field — `contextSize === 0` is falsy, so a legitimately-empty-early-session reads as "no data." Change the guard to `props.usageData?.contextSize != null` so a real `0%`-used state can render. Not the bug; just brittle.

### Related sub-item — model-aware context window
`MAX_CONTEXT_SIZE` is hardcoded `190000` (`AgentInput.tsx:96`). Self-host / local-brain models (and any non-200k model) make the computed `% left` approximate-to-wrong. Make `MAX_CONTEXT_SIZE` model-aware (derive from the active model's real window) once STEP 2 lands. Lower priority — a correct-source 190k-approx gauge already beats today's *nothing*.

### Provenance
Root-caused by the copilot lane this session; the Warden's heal→ticket loop (every healed failure becomes a root-cause fix so it can't recur). Worked example: 2026-06-28 Happy recovery + warden-design.
