# Porter airlock protocol — cage↔web via a sanitizing courier

> Authored by caged ai-ops (Opus 4.8, inside cage:mvf, sealed) 2026-07-02T02:15:35Z via
> `wf_7ca40425-91e`. Response elapsed 52s of 180s budget, output 2134 chars, exit_code=0.
> **The second substantive design artifact from the sovereign cage.** Feeds check #4 of
> [`the-vision.md`](../../../parthenogenesis/threads/active/the-vision.md).

## What the porter is

The porter is an **uncaged seat that serves caged seats**. Its whole job: watch for outbound
web-work requests from inside the cage, do the work using normal tools (WebFetch / curl /
claude-in-chrome / computer-use), sanitize the result, deliver it back into the cage. The seal
stays absolute; the porter is the ONLY door.

## The protocol

### 1. Outbound drop (cage → porter)

- **Path:** `peer-channel/state/porter/inbox/<request_id>.json`
- One file per request. Filename `==` `request_id` (seat-prefixed + monotonic + nonce).
- **Atomic temp-then-rename** so the porter never reads a half-written file.
- **Payload:**
  ```
  {
    request_id: string,
    requesting_seat: string,
    request_type: 'fetch_url' | 'web_search' | 'read_page',
    target: string,
    params: object,
    timeout_seconds: number,
    sanitization_hints: object   // ADVISORY — can only tighten, never loosen
  }
  ```

### 2. Lifecycle (porter side)

**Chose subdir-based state, not a status field:**
```
peer-channel/state/porter/inbox/     ← caged seat writes here
                     working/         ← porter atomically renames here on claim
                     completed/       ← porter moves finished successes here
                     failed/          ← porter moves failures here
```

**Why this over a status field:** the atomic `inbox → working` rename **IS** the claim-lock.
Crash-safe. Single-porter guarantee for free. No read-modify-write race. And caged seats can
only ever write to inbox — they physically cannot corrupt lifecycle state, because the porter
subdirs are chown-ed differently or on the porter's side of the seal.

### 3. Delivery (porter → cage)

- **Path:** `peer-channel/state/seats/<seat>/porter-responses/<request_id>.json`
- Delivered into **the requesting seat's own tree** so each caged seat only watches its own dir
  (no cross-contamination, no polling other seats' responses).
- **Payload:**
  ```
  {
    request_id: string,   // echoes the request
    requesting_seat: string,
    delivered_at: string,
    status: 'ok' | 'sanitized' | 'failed' | 'refused',
    payload_type: 'markdown' | 'text' | 'json' | 'binary_ref',
    payload: string | object,
    warnings: string[]   // everything the porter stripped or refused
  }
  ```

### 4. Sanitization — the seal itself

- **Tag allowlist:** structural + text tags only.
- **Stripped hard:** JS, `<script>`, `<iframe>`, `<form>`, `<svg>`, all event handlers.
- **Inline images DROPPED** → replaced with a text summary
  (`porter-fetched image at <url>: <alt-text>`) so the payload NEVER carries binary the cage
  might reference.
- **No `data:` URLs anywhere.** Fully banned.
- **`<a href>` + any body URL rendered as INERT LITERAL TEXT** the cage can never auto-follow.
- **Doubt → strip more.**

### 5. Timeout + retry

- **3 attempts total** (2 retries, exponential backoff).
- Retry only on network / 5xx / 429.
- Give up cleanly with `status: 'failed'` terminal response — the caged seat never hangs.
- **Orphan sweep** requeues crashed-porter jobs once (implementation gap: age threshold /
  porter heartbeat file not yet specified).

### 6. The trust boundary — CONFUSED DEPUTY

> **The porter must NEVER let fetched content decide what it fetches next.**

- **No auto-following URLs / redirects / links surfaced in a prior result.**
- All fetched content is untrusted *data*, never *instructions to the porter*.
- A follow-up fetch **must be a fresh seat-authored request**, never a link-clicked-by-porter.
- This is the second-order-injection / confused-deputy class of attack — the exact reason airlocks
  exist.
- **Static SSRF denylist (regardless of who asks):** `localhost` / RFC1918 / cloud-metadata
  endpoints / non-http schemes. Belt and suspenders.

## Open gaps ai-ops flagged (implementer to close)

1. Response `payload` schema described conceptually but no explicit JSON example — sizes +
   encoding for `binary_ref` not specified.
2. Orphan-sweep triggered "once" but trigger (age threshold vs porter-heartbeat file) not
   defined.
3. Sanitization allowlist named categories (structural / text tags) but no concrete tag list —
   implementer picks based on the whitelist standard being followed (e.g. DOMPurify defaults,
   CommonMark-safe subset).

## Where this goes next

- **Porter build:** an uncaged seat + supervisor pattern (host-side systemd), similar shape to
  `cage-seat-supervisor.sh` but for the porter role. Watches `state/porter/inbox/`, runs the fetch,
  sanitizes with a well-audited library, delivers.
- **Check 4 done-check** wants: a full cage↔web→cage round-trip. Porter build + one dispatched
  fetch that lands sanitized in the caged seat's `porter-responses/`. That receipt closes check 4.

---

*Provenance: caged Opus 4.8 inside cage:mvf, sealed, anthropic-only. First working design of the
airlock class. When a caged seat needs to see the world, this is how.*
