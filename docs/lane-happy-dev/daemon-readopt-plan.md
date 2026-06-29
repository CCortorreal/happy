# Daemon re-adopt fix — plan (banked for a fresh careful turn)

> happy-dev, 2026-06-29. Stood down to a fresh focused turn by the overseer: HIGH blast radius
> (session-lifecycle code; a bug could orphan/kill Carlos's ~67 live sessions) + ZERO urgency (Phase 1
> already renders DAEMON-LOST honestly as grey "quiet", so the interim state is acceptable
> indefinitely). Do it RIGHT, not fatigued. Approach (1) is the CONFIRMED call (overseer).

## The problem (root, confirmed)
On a daemon restart (e.g. the CLI version-bump auto-restart — see memory
`happy-daemon-version-bump-orphans-sessions`), the new daemon loads persisted sessions from disk with
**`pid: 0`** (`happy-cli/src/daemon/run.ts:~176`) — metadata/encryption only, NO live-process
attachment. The already-running claude sessions reported themselves to the OLD daemon via the
`/session-started` webhook **on start**, and they don't RE-report — so the new daemon holds them as
`pid:0` ghosts. The seats-oracle then reads them as **DAEMON-LOST**. (This is a known gap — documented
in `happy-cli/src/daemon/CLAUDE.md` Improvements: "we lose track of children when daemon
exits/restarts".)

## The fix — APPROACH (1): running sessions periodically re-report (confirmed)
Have each running happy session **periodically re-POST the `/session-started` webhook** (a heartbeat),
not just once on start. Then a freshly-restarted daemon **re-adopts** every live session within one
interval — self-healing across daemon generations, no process-scan fragility, durable shape.

Why (1) over the alternatives: (2) daemon-start process-scan (reuse `doctor`'s discovery) is more
fragile (PID reuse, match heuristics); (3) persist child PIDs in `daemon.state.json` + re-attach is the
CLAUDE.md-suggested one but still couples to PIDs. (1) keeps sessions discoverable regardless of which
daemon generation is alive — the same "key off a stable, self-reasserting signal" instinct as the
claudeSid join.

## Implementation sketch (for the fresh turn)
- **Session side** (the happy process that calls `notifyDaemonSessionStarted()`): add a periodic
  re-report on an interval (reuse/mirror the existing webhook call). Interval ~ the daemon heartbeat
  (60s) or tighter (e.g. 30s) so re-adoption is quick after a restart. Idempotent: the daemon's
  `onHappySessionWebhook` already handles a re-report of an existing session gracefully (updates the
  tracked session / adopts a not-yet-tracked one) — verify the `!existingSession` branch cleanly
  ADOPTS a re-reporting session post-restart (it should: new daemon has it only as a pid:0 persisted
  ghost, so the webhook's pid match needs care — RECONCILE the pid:0 persisted entry with the
  re-reported live pid rather than creating a duplicate).
- **Daemon side**: ensure `onHappySessionWebhook` re-adopts a persisted-but-pid:0 session on re-report
  (match by `happySessionId`, then attach the live `pid`), instead of treating it as a brand-new or a
  duplicate. This is the delicate part — get the pid:0→live-pid reconciliation exactly right.

## Bright lines for the fresh turn
- Test the reconciliation in isolation FIRST (the daemon integration tests exist:
  `src/daemon/daemon.integration.test.ts`) — never mutate live session-tracking blind.
- Idempotent re-reports (no duplicate TrackedSession entries).
- No change to session SPAWNING (lowest blast radius — only add the re-report + the adopt-on-re-report).
- Verify against the live roster: after the fix + a daemon restart, the grey DAEMON-LOST tiles flip
  back green within one interval (the witness test).
- typecheck-green, commit-no-push.

## Status
Stood down pending a fresh turn. Phase 1 renders the interim state honestly (grey "quiet") — no lie,
no urgency. Resume from here.
