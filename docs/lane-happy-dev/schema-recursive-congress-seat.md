# Recursive CongressSeat schema — proposal + migration

> Authored by caged ai-ops (Opus 4.8, inside cage:mvf, sealed) 2026-07-02T02:12:18Z via
> `wf_03ade2cf-238`. Response elapsed 30s of 180s budget, output 1930 chars, exit_code=0.
> **This is the first substantive design artifact produced from inside the sovereign cage.**
> Feeds check #6 of [`the-vision.md`](../../../parthenogenesis/threads/active/the-vision.md).

## The proposed interface

```typescript
interface CongressSeat {
  seat_id: string;
  parent_seat_id: string | null;    // null => top-level / penthouse
  role: 'penthouse' | 'floor-god' | 'worker' | 'desk' | 'warden' | 'porter';
  depth: number;                    // derived: 0 for penthouse, parent.depth + 1 otherwise
  cage_status: 'sealed' | 'uncaged';
  cage_id: string | null;           // null when uncaged
}
```

## Migration (flat → recursive)

The migration is **additive and non-destructive** — no existing seat rows are dropped.

**(a) `parent_seat_id`:** legacy seats carry no parent field, so the migration backfills with `null` —
which the schema defines as top-level/penthouse — making every pre-existing seat a root until an
operator deliberately re-parents it under a penthouse or floor-god.

**(b) `depth` is not trusted from input:** it's *derived* by walking the `parent_seat_id` chain.
`null` parent is depth 0; every other node is `parent.depth + 1`. Two viable implementations:
- **Write-time materialized cache** — every INSERT/UPDATE recomputes `depth` from parent.
- **Lazy on traversal** — compute at read time.
- **Desk still needs to pick one for the actual implementation** (ai-ops noted this as an open
  design gap).

**(c) The seats-oracle shifts** from enumerating one flat list to traversing a hierarchy:
- Resolves parent links.
- Computes/validates `depth` on the fly.
- **Guards against cycles** (a seat transitively its own ancestor — impossible in a flat list).
  ai-ops flagged this as an open gap: no proposed enforcement mechanism (DB constraint vs
  application-layer check vs oracle-level validation).
- Gains **tier-aware queries** — e.g. `"all seats under floor-god X"`, `"all sealed seats at
  depth ≥ 2"`.
- Should treat `null cage_id + uncaged` as the consistent unsealed state; `sealed` seats
  **must** resolve a concrete `cage_id`.

**(d) The clean backward-compatible fallback:** because legacy seats default to depth 0 with a
null parent, the oracle's old flat view is *exactly* the depth-0 slice of the new tree — so
during rollout the old-shape rendering keeps working while the tree is being populated.

## Open gaps ai-ops surfaced (desk to resolve)

1. Depth-as-write-time-cache vs lazy-traversal — desk picks one.
2. Cycle-guard mechanism — DB constraint / application-layer / oracle-level. Recommendation:
   application-layer at INSERT/UPDATE (schema-server side), plus a periodic oracle sanity walk.
3. The prompt to ai-ops had an escape-artifact (raw `{\\`) that looked like truncation. ai-ops
   pushed back appropriately and inferred through it. Next dispatch: cleaner JSON escaping.

## What the desk adds (from prior mesh-topology work)

The porter and warden roles are the answer to the "how does the caged congress mesh with Happy
+ the traveling desk" question. See sibling doc when built:
`cage-and-airlock-topology.md`. Porter = uncaged web-fetch airlock; warden = uncaged survival
watchdog. Both register in the same tree with `cage_status: 'uncaged'` and their `parent_seat_id`
edge indicating which caged seat they serve (or `null` if they're a top-level porter/warden).

## Where this goes next

- **Schema build:** extend `happy/packages/happy-app/sources/sync/congressTypes.ts` with these
  fields (breaking change — decide backward-compat strategy per rollout window).
- **Sync engine:** update the seat reducer to compute `depth` (pick the two options above).
- **Roster hook:** `useCongressRoster()` returns a tree, not a flat list.
- **LaneTile:** renders recursively, with `cage_status === 'sealed'` getting a 🔒 marker.
- **Server:** `/v1/roster` returns the tree; cycle-guard on write.

---

*Provenance: caged Opus 4.8 inside cage:mvf, sealed, anthropic-only. First substantive design
artifact from the sovereign congress. This is the sovereignty story shipping working code.*
