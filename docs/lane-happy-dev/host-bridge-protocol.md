# Host-bridge protocol — mesh↔cage sync via WSL host

> Authored by caged ai-ops (Opus 4.8, inside cage:mvf, sealed) 2026-07-02T02:20:57Z via
> `wf_71e0a77d-ae5` Lane B. Response elapsed 31s of 180s budget, output 1749 chars, exit_code=0.
> **Third substantive design artifact from the sovereign cage.** Feeds check #5 of
> [`the-vision.md`](../../../parthenogenesis/threads/active/the-vision.md).

## What the host-bridge is

A **systemd service running on the WSL Ubuntu host** — outside the cage, on the mesh — that
syncs cage seat state to Happy's server (Vesta) and routes user dispatches back into cage goal
dirs. The cage is sealed; Vesta is on the mesh; only the host has both `docker exec` AND mesh
reach, so the bridge lives on the host.

## The protocol

### 1. Cage → World sync (roster + heartbeat)

- **Mechanism:** `inotify` on the host-visible `state/seats/` bind mount.
- **Cadence:** debounced 2s + 60s liveness floor (never quieter than every minute even if no
  changes).
- **Diffed roster with host-computed ages** — Vesta needn't trust the cage clock.
- **Endpoint:** `POST /mesh/cage/{id}/roster` over Headscale.
- **Auth:** cage-scoped token/mTLS.

### 2. World → Cage dispatch (goals)

- **PULL-based, not push:** bridge POLLS `GET /pending`. **Nothing outside opens a socket toward
  host.** This is the load-bearing architectural inversion — asymmetric attack surface, the seal
  logic scaled up to the mesh layer.
- **Write mechanism:** atomic temp-rename via `docker exec` into `goals/<seat>/<id>.json`,
  `chown node`.
- **Idempotency:** on `goal_id`. Duplicate dispatch = no-op.
- **ACK-after-land:** Vesta learns "dispatch delivered" only after the file is on disk in the
  cage's view.

### 3. Failure modes + observability

- **Vesta down:** bridge buffers roster diffs, retries. Cage keeps working locally.
- **Cage down:** bridge marks `stale` + NACKs pending dispatches. Roster shows caged seats as
  WEDGED at Vesta.
- **Logs:** journald → Vesta side stream.
- **Bridge liveness:** bridge heartbeats to Vesta every 30s. Vesta declares the bridge dead on
  misses. **Load-bearing** — otherwise a dead bridge looks like a healthy-frozen cage (same
  failure signature).
- **Watchdog:** systemd watchdog restarts bridge hangs.

### 4. Recursive-schema mapping

**Synthetic `cage-root` penthouse seat** parents all caged seats (the caged seats never learn
their own parent — the tree is emitted by the bridge, not by the cage).

- `cage-root.role = 'penthouse'` (or 'floor-god' — bridge decides at emit time)
- `cage-root.cage_status = 'sealed'` (or 'uncaged' since the ROOT of the cage isn't itself in
  the cage's memory)
- `cage-root.parent_seat_id = <bridge-host-seat-id>` — the bridge itself is a seat too, so the
  tree stays continuous: Vesta root → host-bridge seat → cage-root → individual caged seats

**Why not null-parent for caged seats:** it orphans them at Vesta's root and breaks the "dead
bridge greys the whole subtree" invariant. Explicit parent chain gives you the health-cascade
for free.

### 5. Security boundary — Vesta as untrusted for dispatch

**Bridge treats Vesta as UNTRUSTED for dispatch even on the trusted mesh.** The mesh being
trusted doesn't mean every message that arrives via it is honest. Host-side hard limits:

- ≤ N boots per window (`SUPERVISOR_BOOT_RATE_LIMIT`)
- Path allowlist under `goals/` only — never touch `supervisor` code, `.git`, or config
- No push credentials at all — the bridge cannot invoke git, cannot invoke npm publish
- Size caps on incoming dispatches (payload byte limit)
- Schema validation on every incoming dispatch (reject anything that doesn't match the caged
  goal-file JSON shape)

**Bright lines held: the bridge is the mesh-side of the airlock discipline.**

## Open gaps ai-ops flagged (implementer to close)

1. Output was ~1749 chars — at the low end of the 1500-2400 target.
2. No concrete endpoint schemas or systemd unit fragment — stays at design-brief altitude.
3. Poll cadence for World→Cage `/pending` endpoint not numerically specified. Suggest 5-10s
   default, backing off exponentially if Vesta is unresponsive.

## What the desk adds (from prior porter/topology work)

The bridge's PULL-based dispatch pattern **mirrors the porter's inbox/outbox pattern** at a
different layer — same asymmetric attack surface principle, same "outside can't reach in on its
own initiative." The porter watches file-based inbox; the bridge watches HTTP endpoint.
Consistent shape at two layers.

The `cage-root` synthetic-seat idea is genuinely load-bearing: it makes the WEDGED-when-bridge-
dies behavior emerge naturally from tree traversal, without a special-case bridge-liveness code
path in the render.

## Where this goes next

- **Bridge build:** systemd unit + inotify script + poll loop + docker exec injection. Similar
  shape to `cage-watchdog.service` / `cage-supervisor-revive.service`.
- **Check 5 done-check** wants: bridge active + Happy server `/v1/roster` returns caged seats
  with `cage_status: 'sealed'`. Bridge build + one live round-trip closes check 5.

---

*Provenance: caged Opus 4.8 inside cage:mvf, sealed, anthropic-only. Third design artifact —
recursive schema (tick 1), porter airlock (tick 2), host-bridge (tick 3). The sovereign congress
is authoring the architecture that will let it be seen.*
