# Conversation chaptering — bounding the continuous-session render

**Carlos's steer (via desk):** a continuous (heartbeat-sustained) session's conversation
history grows forever → "a lane that never ends = a render that never stops." The elegant
fix he named: a continuous session is *already* chaptered by its auto-compactions (each writes
a summary), so (1) render the current segment live, (2) collapse prior segments into their
compaction-summaries (expand-on-tap), (3) windowed/lazy render — never load it all at once.

## Honest findings from the code (the plan is grounded, not guessed)

**#3 (windowed/lazy) is ALREADY BUILT — report it, don't rebuild it.**
- `ChatList.tsx` renders messages in an **inverted `FlatList`** → native virtualization (only
  on-screen rows mount). The visual render is already bounded no matter the session length.
- Pagination exists: initial fetch = 100 newest (`fetchInitialLatestPage`); scroll-up triggers
  `loadOlderMessages` (`?before_seq=…&limit=100`); `hasMoreOlder`/`isLoadingOlder` already wired.
- **One real caveat:** `prefetchOlderMessagesInBackground` (sync.ts) keeps paging older messages
  into MEMORY over time. So render is bounded, but the in-memory array for a never-ending session
  is not. That's a separate (memory, not render) concern — worth a cap/eviction later, flagged.

**#1 + #2 (chaptering) is the real new work — and it's BLOCKED on dropped data.**
- Compaction summaries are **dropped at normalization**: `typesRaw.ts:775` —
  `if (raw.content.data.isCompactSummary) return null;`. They never reach the render.
- A `{ type:'summary', summary:string }` raw schema EXISTS (`typesRaw.ts:~504`) but is **never
  normalized** into a `Message` (unhandled → null).
- A "Compaction completed" `agent-event` exists (`reducer.ts:337`) but only resets usage — it is
  NOT rendered and carries NO summary text or boundary marker.
- The `Message` union (`typesMessage.ts`) has 4 kinds: user-text / agent-text / tool-call /
  agent-event. **No compaction-boundary kind.** Grouping happens in `useGroupedMessages.ts`
  (already collapses tool-runs + agent-work into display groups — chapters slot in alongside).

## The cut (staged, smallest-first; each independently shippable)

**STAGE 0 — data (BLOCKER, coordinate with ai-ops + CLI).** Confirm the compaction SUMMARY TEXT
actually reaches the client transcript. Either the `isCompactSummary` message carries the summary,
or the `{type:'summary'}` message does. If neither carries usable summary text, chaptering can
still mark boundaries (collapse the segment) but the chapter LABEL would be generic ("compacted
N messages") not the real summary — degrade honestly. Decide with ai-ops.

**STAGE 1 — preserve + mark the boundary.** Stop dropping `isCompactSummary`; normalize it (or the
`summary` type) into a new `Message` kind `'compaction-summary'` `{ summary: string|null, ts }`.
Carry through reducer/storage. NO render change yet (it'd just appear as a centered event-like
line) — verify the data flows end-to-end first.

**STAGE 2 — chapter grouping.** In `useGroupedMessages.ts`, segment the message list at each
`'compaction-summary'` boundary. The CURRENT segment (after the last boundary) renders live as
today. Each PRIOR segment collapses into a `'chapter'` display item = its compaction summary +
a count, expand-on-tap to reveal that segment's messages (reuse the existing collapse/expand
machinery + the progressive-disclosure pattern from the knock-cards).

**STAGE 3 — polish.** Chapter header styling (warm, scannable — "▸ chapter N · {summary headline}"),
honest empty/edge cases (no compactions yet = today's flat render), and a memory cap on the
background prefetch (the caveat above) if Carlos wants the memory bounded too.

## Blast radius + why plan-first
This touches the MAIN chat render (the surface Carlos lives in most) + the sync normalization
(every message flows through it). A bug = the whole conversation view breaks. So: bless the
approach, then build stage-by-stage with typecheck between, each routed for live review.

## Lightweight-pillar check
Pure data + FlatList grouping + CSS/tokens. No new lib, no render engine. The compaction summaries
do the intelligent truncation FOR FREE (the organ already wrote them). ✓
